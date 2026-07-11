import Visualizer from '../../components/Visualizer';

export const metadata = {
  title: 'Playground | Aether',
  description: 'Live compiler visualization playground with tokens, AST, HIR, IR, disassembly, and execution.',
};

export default function PlaygroundPage() {
  return <Visualizer />;
}
