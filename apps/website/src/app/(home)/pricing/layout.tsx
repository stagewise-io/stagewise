export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen w-full flex-col items-center bg-zinc-50 py-32 dark:bg-black">
      {children}
    </main>
  );
}
