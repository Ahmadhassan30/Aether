import LandingPage from '../components/LandingPage';

export const metadata = {
  title: 'Aether',
  description: 'Live compiler visualization in the browser for tokens, AST, HIR, IR, disassembly, and VM execution.',
};

export default function Home() {
  return <LandingPage />;
}
