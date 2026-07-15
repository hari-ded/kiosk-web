export function AgentConsole() {
  return (
    <div className="w-full h-full p-8 bg-gray-900 text-white flex flex-col">
      <header className="h-16 flex items-center justify-between border-b border-gray-700 mb-8 pb-4 shrink-0">
        <h1 className="text-3xl font-bold">Operator Console</h1>
        <div className="text-xl text-gray-400">Terminal 1</div>
      </header>
      <main className="flex-1 flex items-center justify-center">
        <p className="text-2xl text-gray-500">Agent tools loading...</p>
      </main>
    </div>
  );
}
