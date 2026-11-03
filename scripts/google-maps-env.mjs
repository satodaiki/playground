import { execFileSync, spawnSync } from 'node:child_process';
import { loadEnv } from 'vite';

const command = process.argv[2] || 'check';
const env = { ...loadEnv(command === 'dev' ? 'development' : 'production', process.cwd(), 'VITE_'), ...process.env };
const parameter = process.env.GOOGLE_MAPS_API_KEY_PARAMETER || '/playground/production/google-maps/browser-api-key';
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-northeast-1';
let key = env.VITE_GOOGLE_MAPS_API_KEY?.trim();
let source = '環境変数（値は表示しません）';
if (!key || key === 'your-browser-api-key') {
  try {
    const result = JSON.parse(execFileSync('aws', [
      'ssm', 'get-parameter', '--name', parameter, '--with-decryption', '--region', region,
      '--query', 'Parameter.{Type:Type,Value:Value}', '--output', 'json',
    ], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }));
    if (result.Type !== 'SecureString' || typeof result.Value !== 'string' || !result.Value.trim()) throw new Error('Invalid parameter');
    key = result.Value.trim();
    source = 'AWS Parameter Store（SecureString、値は表示しません）';
  } catch {
    console.error('Google Maps の API キーを取得できませんでした。');
    console.error('AWS CLI の認証と本番パラメーターへの ssm:GetParameter 権限を確認するか、VITE_GOOGLE_MAPS_API_KEY を設定してください。');
    process.exit(1);
  }
}
env.VITE_GOOGLE_MAPS_API_KEY = key;
console.log(`Google Maps キーの取得元: ${source}`);
console.log(`マップ ID: ${env.VITE_GOOGLE_MAPS_MAP_ID?.trim() ? '独自 ID を使用' : 'DEMO_MAP_ID を使用'}`);
if (command === 'check') {
  console.log('設定の取得を確認しました。API の有効化・課金・利用元制限はブラウザーでの動作確認が必要です。');
} else {
  const target = { dev: 'dev:fast', build: 'build', deploy: 'deploy:static' }[command];
  if (!target) { console.error('Supported commands: check, dev, build, deploy'); process.exit(1); }
  const forwarded = process.argv.slice(3);
  const result = spawnSync('npm', ['run', target, ...(forwarded.length ? ['--', ...forwarded] : [])], { env, stdio: 'inherit' });
  if (result.error) { console.error('npm の起動に失敗しました。'); process.exit(1); }
  process.exitCode = result.status ?? 1;
}
