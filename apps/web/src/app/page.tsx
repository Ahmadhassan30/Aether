import dynamic from 'next/dynamic';

const Visualizer = dynamic(() => import('../components/Visualizer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-400 font-sans">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-200" />
        <span className="text-sm font-medium tracking-wide">Initializing workspace...</span>
      </div>
    </div>
  ),
});

export default function Home() {
  return <Visualizer />;
}
