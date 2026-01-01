import Cell from '@/components/tetlis/Cell';

const Stage = ({ stage }) => (
  <div style={{
    display: 'grid',
    gridTemplateRows: `repeat(${stage.length}, calc(25vw / ${stage[0].length}))`,
    gridTemplateColumns: `repeat(${stage[0].length}, 1fr)`,
    gridGap: '1px',
    border: '2px solid #333',
    width: '100%',
    maxWidth: '25vw',
    background: '#111',
  }}>
    {stage.map(row => row.map((cell, x) => <Cell key={x} type={cell[0]} />))}
  </div>
);

export default Stage;