import base64
import json
import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).parent))
import lambda_function as app  # noqa: E402


class StateTest(unittest.TestCase):
    def test_signed_state_rejects_tampering_expiry_and_unknown_origin(self):
        secret = "x" * 32
        state = app.create_state("https://example.com", secret, now=1_000)
        payload = app.verify_state(state, secret, {"https://example.com"}, now=1_001)
        self.assertEqual(payload["origin"], "https://example.com")

        with self.assertRaises(ValueError):
            app.verify_state(state + "x", secret, {"https://example.com"}, now=1_001)
        with self.assertRaises(ValueError):
            app.verify_state(state, secret, {"https://other.example"}, now=1_001)
        with self.assertRaises(ValueError):
            app.verify_state(state, secret, {"https://example.com"}, now=1_601)


class RuleTest(unittest.TestCase):
    def test_parses_nested_gmail_body_and_known_subscription(self):
        body = base64.urlsafe_b64encode(
            "合計: ￥1,490 月額 請求日: 2026年8月20日".encode()
        ).decode().rstrip("=")
        message = {
            "id": "gmail-1",
            "internalDate": "1787184000000",
            "payload": {
                "mimeType": "multipart/alternative",
                "headers": [
                    {"name": "From", "value": "Netflix <billing@netflix.com>"},
                    {"name": "Subject", "value": "Netflix ご請求のお知らせ"},
                    {"name": "Date", "value": "Thu, 20 Aug 2026 09:00:00 +0900"},
                ],
                "parts": [{"mimeType": "text/plain", "body": {"data": body}}],
            },
        }

        email = app.parse_gmail_message(message)
        matched, subscription, cancelled_service = app.classify_known(email)

        self.assertTrue(matched)
        self.assertIsNone(cancelled_service)
        self.assertEqual(email["billed_at"], "2026-08-20")
        self.assertIsNotNone(subscription)
        self.assertEqual(subscription["service_name"], "Netflix")
        self.assertEqual(subscription["amount"], 1490.0)
        self.assertEqual(subscription["currency"], "JPY")
        self.assertEqual(subscription["billing_cycle"], "monthly")
        self.assertEqual(subscription["estimated_monthly_amount"], 1490.0)

    def test_unknown_sender_is_left_for_ai(self):
        self.assertEqual(
            app.classify_known(
                {
                    "sender": "receipts@example.test",
                    "subject": "Your renewal receipt",
                    "body": "$10 monthly",
                    "billed_at": "2026-08-20",
                }
            ),
            (False, None, None),
        )

    def test_ignores_cancelled_and_stale_monthly_known_services(self):
        today = datetime.now(timezone.utc).date().isoformat()
        cancelled = {
            "sender": "billing@netflix.com",
            "subject": "Your subscription was canceled",
            "body": "$10 monthly",
            "billed_at": today,
        }
        stale = {
            **cancelled,
            "subject": "Netflix receipt",
            "billed_at": "2020-01-01",
        }

        self.assertEqual(app.classify_known(cancelled), (True, None, "Netflix"))
        self.assertEqual(app.classify_known(stale), (True, None, None))

    def test_ignores_known_service_mail_without_billing_evidence(self):
        today = datetime.now(timezone.utc).date().isoformat()
        shipping = {
            "sender": "shipment-tracking@amazon.co.jp",
            "subject": "Amazon Prime でお届け予定です",
            "body": "ご注文の商品 ￥12,800 を本日お届けします。",
            "billed_at": today,
        }
        receipt = {**shipping, "subject": "Amazon Prime 会費の領収書", "body": "合計 ￥600 月額"}

        self.assertEqual(app.classify_known(shipping), (True, None, None))
        self.assertEqual(app.classify_known(receipt)[1]["amount"], 600.0)

    def test_reads_text_body_stored_as_gmail_attachment(self):
        encoded = base64.urlsafe_b64encode("Total $12 monthly".encode()).decode().rstrip("=")
        message = {
            "id": "gmail-attachment",
            "payload": {
                "mimeType": "multipart/alternative",
                "headers": [],
                "parts": [{
                    "mimeType": "text/plain",
                    "body": {"attachmentId": "attachment-1"},
                }],
            },
        }

        email = app.parse_gmail_message(message, lambda attachment_id: encoded)

        self.assertEqual(email["body"], "Total $12 monthly")

    def test_prefers_total_over_subtotal(self):
        amount, currency = app._extract_amount("Subtotal $9.00 Total $10.00")
        self.assertEqual((amount, currency), (10.0, "USD"))


class OpenAIRequestTest(unittest.TestCase):
    EMAIL = {
        "id": "m-1",
        "sender": "billing@example.test",
        "subject": "Receipt",
        "billed_at": "2026-08-20",
        "body": "$10 monthly",
    }

    def _call(self, api_response):
        with patch.object(app, "_external_json", return_value=api_response) as request:
            results = app._analyse_openai_batch([self.EMAIL], "sk-test")
        return request.call_args, results

    def test_sends_a_stateless_responses_api_request_with_structured_outputs(self):
        (args, kwargs), results = self._call(
            {
                "output": [{
                    "type": "message",
                    "content": [{
                        "type": "output_text",
                        "text": '{"results": [{"message_id": "m-1"}]}',
                    }],
                }],
            }
        )
        payload = kwargs["payload"]

        self.assertEqual(args[0], "https://api.openai.com/v1/responses")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer sk-test")
        self.assertEqual(payload["model"], "gpt-5.6-luna")
        self.assertFalse(payload["store"])
        self.assertEqual(payload["text"]["format"]["type"], "json_schema")
        self.assertTrue(payload["text"]["format"]["strict"])
        self.assertEqual(payload["text"]["format"]["schema"], app.OPENAI_SCHEMA)
        self.assertEqual(json.loads(payload["input"])[0]["message_id"], "m-1")
        self.assertEqual(results, [{"message_id": "m-1"}])

    def test_refusal_and_empty_content_are_reported_as_api_errors(self):
        refusal = {"output": [{"content": [{"type": "refusal", "refusal": "no"}]}]}
        for response in (refusal, {"output": []}):
            with self.subTest(response=response), self.assertRaises(app.ExternalAPIError):
                self._call(response)


class ResultTest(unittest.TestCase):
    def test_newer_cancellation_suppresses_older_known_receipt(self):
        today = datetime.now(timezone.utc).date().isoformat()
        receipt = {
            "id": "receipt",
            "sender": "billing@netflix.com",
            "subject": "Netflix subscription receipt",
            "body": "￥1,490 monthly",
            "billed_at": today,
        }
        cancellation = {
            **receipt,
            "id": "cancel",
            "subject": "Netflix subscription was canceled",
        }

        with patch.object(app, "scan_gmail", return_value=([receipt, cancellation], [])):
            result = app.scan_subscriptions("test-token")

        self.assertEqual(result["subscriptions"], [])

    def test_ai_result_does_not_revive_stale_monthly_subscription(self):
        email = {
            "id": "old-1",
            "sender": "billing@example.test",
            "subject": "Monthly subscription receipt",
            "body": "$10 monthly",
            "billed_at": "2020-01-01",
        }
        model_result = [{
            "message_id": "old-1",
            "is_subscription": True,
            "service_name": "Example",
            "amount": 10,
            "currency": "USD",
            "billed_at": "2020-01-01",
            "billing_cycle": "monthly",
            "confidence": 0.9,
        }]

        with patch.object(app, "_analyse_openai_batch", return_value=model_result):
            subscriptions, analysed, warnings = app.analyse_unknown([email], "test-key")

        self.assertEqual(subscriptions, [])
        self.assertEqual(analysed, 1)
        self.assertEqual(warnings, [])

    def test_deduplicates_latest_service_and_summarises_monthly_cost(self):
        older = {
            "service_name": "Netflix",
            "amount": 1000.0,
            "currency": "JPY",
            "billed_at": "2026-07-01",
            "billing_cycle": "monthly",
            "source": "rule",
            "confidence": 0.95,
            "estimated_monthly_amount": 1000.0,
        }
        newer = {**older, "amount": 1490.0, "billed_at": "2026-08-01", "estimated_monthly_amount": 1490.0}
        annual = {
            "service_name": "Example Cloud",
            "amount": 120.0,
            "currency": "USD",
            "billed_at": "2026-08-02",
            "billing_cycle": "yearly",
            "source": "ai",
            "confidence": 0.8,
            "estimated_monthly_amount": 10.0,
        }

        result = app.deduplicate_subscriptions([older, newer, annual])
        self.assertEqual(len(result), 2)
        self.assertEqual(next(item for item in result if item["service_name"] == "Netflix")["amount"], 1490.0)
        self.assertEqual(
            app.summarise(result),
            {
                "monthly_totals": [
                    {"currency": "JPY", "amount": 1490.0},
                    {"currency": "USD", "amount": 10.0},
                ],
                "annual_savings_potential": [
                    {"currency": "JPY", "amount": 17880.0},
                    {"currency": "USD", "amount": 120.0},
                ],
            },
        )

    def test_health_and_popup_payload_shape(self):
        with patch.dict(os.environ, {"ALLOWED_ORIGINS": "https://example.com"}, clear=False):
            health = app.lambda_handler(
                {
                    "rawPath": "/health",
                    "headers": {"origin": "https://example.com"},
                    "requestContext": {"http": {"method": "GET"}},
                },
                None,
            )
            self.assertEqual(health["statusCode"], 200)
            self.assertEqual(json.loads(health["body"]), {"ok": True})

    def test_oauth_start_redirects_only_for_an_allowed_origin(self):
        environment = {
            "ALLOWED_ORIGINS": "https://example.com",
            "OAUTH_STATE_SECRET": "x" * 32,
            "GOOGLE_CLIENT_ID": "client-id",
        }

        def start(origin):
            return app.lambda_handler(
                {
                    "rawPath": "/oauth/start",
                    "queryStringParameters": {"origin": origin},
                    "requestContext": {
                        "domainName": "example.lambda-url.ap-northeast-1.on.aws",
                        "http": {"method": "GET"},
                    },
                },
                None,
            )

        with patch.dict(os.environ, environment, clear=False):
            allowed = start("https://example.com")
            denied = start("https://attacker.example")

        self.assertEqual(allowed["statusCode"], 302)
        self.assertIn(
            "redirect_uri=https%3A%2F%2Fexample.lambda-url.ap-northeast-1.on.aws%2Foauth%2Fcallback",
            allowed["headers"]["Location"],
        )
        self.assertEqual(denied["statusCode"], 400)

    def test_callback_mode_cannot_be_overridden_outside_signed_state(self):
        environment = {
            "ALLOWED_ORIGINS": "https://example.com",
            "OAUTH_STATE_SECRET": "x" * 32,
        }
        with patch.dict(os.environ, environment, clear=False):
            state = app.create_state("https://example.com", environment["OAUTH_STATE_SECRET"])
            response = app.lambda_handler(
                {
                    "rawPath": "/oauth/callback",
                    "queryStringParameters": {
                        "state": state,
                        "error": "access_denied",
                        "mode": "json",
                    },
                    "requestContext": {
                        "domainName": "example.lambda-url.ap-northeast-1.on.aws",
                        "http": {"method": "GET"},
                    },
                },
                None,
            )

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(response["headers"]["Content-Type"], "text/html; charset=utf-8")


if __name__ == "__main__":
    unittest.main()
