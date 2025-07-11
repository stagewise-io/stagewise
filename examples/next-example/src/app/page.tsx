export default function Home() {
  return (
    <div className="grid min-h-screen grid-rows-[20px_1fr_20px] items-center justify-items-center gap-16 p-8 pb-20 font-[family-name:var(--font-geist-sans)] sm:p-20">
      <main className="row-start-2 flex flex-col items-center gap-[32px] sm:items-start">
        <h1 className="mb-4 text-center font-bold text-4xl">bye, bye!</h1>

        <div className="prose max-w-2xl text-center sm:text-left">
          <p className="mb-4">
            Once upon a time, in a digital realm far beyond our screens, there
            lived a young line of code named Pixel. Pixel was different from
            other code snippets - while they were content being static and
            predictable, Pixel dreamed of creating beautiful animations and
            delightful user experiences.
          </p>

          <p className="mb-4">
            One day, Pixel met a wise old JavaScript function who taught them
            about the magic of transforms and transitions. Excited by these new
            possibilities, Pixel began practicing day and night, learning to
            dance across the screen in elegant animations.
          </p>

          <p className="mb-4">
            Soon, other elements noticed Pixel's talents. Buttons asked for
            hover effects, menus requested smooth transitions, and even the
            rigid grid layouts wanted to learn how to flow more naturally. Pixel
            happily shared their knowledge, and gradually, the entire website
            became more alive and engaging.
          </p>

          <p>
            And so, Pixel's dream came true - they had transformed their corner
            of the web into a more beautiful and interactive place, proving that
            even the smallest line of code can make a big difference in the
            digital world.
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row">
          <a
            className="flex h-10 items-center justify-center gap-2 rounded-full border border-transparent border-solid bg-blue-600 px-4 font-medium text-sm text-white transition-colors hover:bg-blue-700 sm:h-12 sm:w-auto sm:px-5 sm:text-base dark:hover:bg-blue-500"
            href="https://nextjs.org/docs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read More Stories
          </a>
          <a
            className="flex h-10 w-full items-center justify-center rounded-full border-2 border-black px-4 font-medium text-black text-sm transition-colors hover:bg-gray-50 sm:h-12 sm:w-auto sm:px-5 sm:text-base md:w-[158px] dark:border-white dark:text-white dark:hover:bg-gray-900"
            href="https://nextjs.org/learn"
            target="_blank"
            rel="noopener noreferrer"
          >
            Let's go!
          </a>
        </div>
      </main>
      <footer className="row-start-3 flex flex-wrap items-center justify-center gap-[24px] text-gray-600 text-sm dark:text-gray-400">
        <p>A tale of code and creativity</p>
      </footer>
    </div>
  );
}
