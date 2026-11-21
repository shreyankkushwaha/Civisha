interface ComingSoonProps {
  title: string;
}

export function ComingSoon({ title }: ComingSoonProps) {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 p-6">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h2>
        <p className="mt-2 text-gray-500 dark:text-gray-400">This feature is currently under development.</p>
      </div>
    </div>
  );
}
