import Game from './components/Game';

function App() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#000',
    }}>
      <Game />
    </div>
  );
}

export default App;
