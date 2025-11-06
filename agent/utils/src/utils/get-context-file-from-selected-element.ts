import type { SelectedElement } from '@stagewise/karton-contract';
import { generateObject, generateText, type ModelMessage } from 'ai';
import { htmlElementToContextSnippet } from '@stagewise/agent-prompts';
import { z } from 'zod';
import type { LanguageModelV2 } from '@ai-sdk/provider';
import { queryRagWithoutRerank } from '@stagewise/agent-rag';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';

type RetrievalResult = {
  relativePath: string;
  content: string;
  startLine: number;
  endLine: number;
};

/**
 * Example of what a transformed HTMLElement looks like after being processed
 * by htmlElementsToContextSnippet(). This example is based on the revenue card
 * element from example_1 in the description prompt below.
 *
 * The structure shows:
 * - The selected outer div (role="selected-element", depth="0")
 * - Its child div (role="child", depth="1")
 * - Grandchildren h3 and span elements (role="child", depth="2")
 */
export const exampleElement: string = `<html-element type="div" role="selected-element" selected="true" depth="0" selector=".bg-white.dark:bg-zinc-900.rounded-xl.shadow-lg.p-6.border.border-zinc-200.dark:border-zinc-800" xpath="/html/body/div">
<div classNames="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-6 border border-zinc-200 dark:border-zinc-800"></div>
</html-element>

<html-element type="div" role="child" depth="1" selector=".flex.items-center.justify-between.mb-4" xpath="/html/body/div/div">
<div classNames="flex items-center justify-between mb-4"></div>
</html-element>

<html-element type="h3" role="child" depth="2" selector=".text-xl.font-semibold.text-zinc-900.dark:text-zinc-100" xpath="/html/body/div/div/h3">
<h3 classNames="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Monthly Revenue</h3>
</html-element>

<html-element type="span" role="child" depth="2" selector=".text-sm.text-zinc-500.bg-green-100.dark:bg-green-900/30.px-2.py-1.rounded" xpath="/html/body/div/div/span">
<span classNames="text-sm text-zinc-500 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded">+12.5%</span>
</html-element>`;

/**
 * Second example showing a product analytics conversion funnel card.
 * This demonstrates a more complex hierarchy with multiple levels of children
 * and various UI elements typical in analytics dashboards like PostHog.
 *
 * The structure shows:
 * - The selected analytics card container (role="selected-element", depth="0")
 * - Header section with title and time period (role="child", depth="1")
 * - Multiple funnel step containers (role="child", depth="1", "2", "3")
 * - Individual metric elements within each step (role="child", depth="2", "3", "4")
 */
export const exampleElement2: string = `<html-element type="div" role="selected-element" selected="true" depth="0" selector=".analytics-card.border.border-slate-200.dark:border-slate-800.rounded-lg.bg-white.dark:bg-slate-900.p-6.shadow-sm" xpath="/html/body/div[2]">
<div classNames="analytics-card border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-6 shadow-sm"></div>
</html-element>

<html-element type="div" role="child" depth="1" selector=".flex.justify-between.items-start.mb-6" xpath="/html/body/div[2]/div[1]">
<div classNames="flex justify-between items-start mb-6"></div>
</html-element>

<html-element type="h3" role="child" depth="2" selector=".text-lg.font-bold.text-slate-900.dark:text-slate-100" xpath="/html/body/div[2]/div[1]/h3">
<h3 classNames="text-lg font-bold text-slate-900 dark:text-slate-100">Conversion Funnel</h3>
</html-element>

<html-element type="span" role="child" depth="2" selector=".text-xs.text-slate-500.dark:text-slate-400.bg-slate-100.dark:bg-slate-800.px-2.py-1.rounded" xpath="/html/body/div[2]/div[1]/span">
<span classNames="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">Last 7 days</span>
</html-element>

<html-element type="div" role="child" depth="1" selector=".space-y-3" xpath="/html/body/div[2]/div[2]">
<div classNames="space-y-3"></div>
</html-element>

<html-element type="div" role="child" depth="2" selector=".funnel-step.flex.items-center.justify-between.p-3.bg-blue-50.dark:bg-blue-950.rounded-md.border-l-4.border-blue-500" xpath="/html/body/div[2]/div[2]/div[1]">
<div classNames="funnel-step flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 rounded-md border-l-4 border-blue-500"></div>
</html-element>

<html-element type="span" role="child" depth="3" selector=".font-medium.text-slate-700.dark:text-slate-300" xpath="/html/body/div[2]/div[2]/div[1]/span[1]">
<span classNames="font-medium text-slate-700 dark:text-slate-300">Page View</span>
</html-element>

<html-element type="div" role="child" depth="3" selector=".flex.items-center.gap-3" xpath="/html/body/div[2]/div[2]/div[1]/div">
<div classNames="flex items-center gap-3"></div>
</html-element>

<html-element type="span" role="child" depth="4" selector=".text-2xl.font-bold.text-slate-900.dark:text-slate-100" xpath="/html/body/div[2]/div[2]/div[1]/div/span[1]">
<span classNames="text-2xl font-bold text-slate-900 dark:text-slate-100">12,458</span>
</html-element>

<html-element type="span" role="child" depth="4" selector=".text-xs.text-blue-600.dark:text-blue-400.bg-blue-100.dark:bg-blue-900.px-2.py-1.rounded" xpath="/html/body/div[2]/div[2]/div[1]/div/span[2]">
<span classNames="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">100%</span>
</html-element>

<html-element type="div" role="child" depth="2" selector=".funnel-step.flex.items-center.justify-between.p-3.bg-amber-50.dark:bg-amber-950.rounded-md.border-l-4.border-amber-500" xpath="/html/body/div[2]/div[2]/div[2]">
<div classNames="funnel-step flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950 rounded-md border-l-4 border-amber-500"></div>
</html-element>

<html-element type="span" role="child" depth="3" selector=".font-medium.text-slate-700.dark:text-slate-300" xpath="/html/body/div[2]/div[2]/div[2]/span[1]">
<span classNames="font-medium text-slate-700 dark:text-slate-300">Add to Cart</span>
</html-element>

<html-element type="div" role="child" depth="3" selector=".flex.items-center.gap-3" xpath="/html/body/div[2]/div[2]/div[2]/div">
<div classNames="flex items-center gap-3"></div>
</html-element>

<html-element type="span" role="child" depth="4" selector=".text-2xl.font-bold.text-slate-900.dark:text-slate-100" xpath="/html/body/div[2]/div[2]/div[2]/div/span[1]">
<span classNames="text-2xl font-bold text-slate-900 dark:text-slate-100">3,847</span>
</html-element>

<html-element type="span" role="child" depth="4" selector=".text-xs.text-amber-600.dark:text-amber-400.bg-amber-100.dark:bg-amber-900.px-2.py-1.rounded" xpath="/html/body/div[2]/div[2]/div[2]/div/span[2]">
<span classNames="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900 px-2 py-1 rounded">30.9%</span>
</html-element>

<html-element type="div" role="child" depth="2" selector=".funnel-step.flex.items-center.justify-between.p-3.bg-green-50.dark:bg-green-950.rounded-md.border-l-4.border-green-500" xpath="/html/body/div[2]/div[2]/div[3]">
<div classNames="funnel-step flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-md border-l-4 border-green-500"></div>
</html-element>

<html-element type="span" role="child" depth="3" selector=".font-medium.text-slate-700.dark:text-slate-300" xpath="/html/body/div[2]/div[2]/div[3]/span[1]">
<span classNames="font-medium text-slate-700 dark:text-slate-300">Completed Purchase</span>
</html-element>

<html-element type="div" role="child" depth="3" selector=".flex.items-center.gap-3" xpath="/html/body/div[2]/div[2]/div[3]/div">
<div classNames="flex items-center gap-3"></div>
</html-element>

<html-element type="span" role="child" depth="4" selector=".text-2xl.font-bold.text-slate-900.dark:text-slate-100" xpath="/html/body/div[2]/div[2]/div[3]/div/span[1]">
<span classNames="text-2xl font-bold text-slate-900 dark:text-slate-100">1,923</span>
</html-element>

<html-element type="span" role="child" depth="4" selector=".text-xs.text-green-600.dark:text-green-400.bg-green-100.dark:bg-green-900.px-2.py-1.rounded" xpath="/html/body/div[2]/div[2]/div[3]/div/span[2]">
<span classNames="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900 px-2 py-1 rounded">15.4%</span>
</html-element>`;

async function retrieveFilesForSelectedElement(
  element: SelectedElement,
  workspaceDataPath: string,
  model: LanguageModelV2,
  apiKey: string,
) {
  const descriptionPrompt = `
  ROLE: You are an expert at analyzing web application UI elements and describing them in rich, natural language that captures both their visual appearance and semantic purpose.

  CONTEXT: You will receive HTML elements in a special XML format with the following structure:
  - <html-element> tags wrap each element with metadata attributes
  - "role" attribute indicates the element's relationship: "selected-element" (the main focus), "parent" (ancestors), "child" (descendants), or "sibling" (same-level elements)
  - "depth" attribute shows distance from the selected element (0 = selected, negative = parents, positive = children)
  - "selected='true'" marks the primary element you should focus on
  - The surrounding elements (parents, children, siblings) provide context to understand the selected element's purpose

  YOUR_TASK: Generate a comprehensive natural language description of the SELECTED ELEMENT (marked with selected="true"). Focus primarily on this element while using surrounding elements to understand its context and purpose within the UI.

  REQUIREMENTS:
  1. START with the element's primary purpose and what it displays to the user
  2. INCLUDE specific text content, numbers, labels, and data shown in the element (e.g., "displays '12,458 users'" not just "displays user count")
  3. DESCRIBE visual styling including colors, layouts, borders, shadows, and dark mode variations
  4. MENTION child elements and their purpose (e.g., "contains a header section with a title and badge")
  5. IDENTIFY the business logic or user intent (e.g., "allows users to track conversion rates" or "displays revenue performance")
  6. USE concrete details from class names to infer design patterns (e.g., "flexbox layout", "rounded corners", "subtle shadow")
  7. ADAPT description length to element complexity (simple button = 2-3 sentences, complex dashboard card = 5-8 sentences)
  8. WRITE in a flowing paragraph style, not bullet points

  COMMON MISTAKES TO AVOID:
  - ❌ Generic descriptions without specific text/numbers: "A card showing metrics" → ✅ "A card displaying 12,458 page views with a 100% baseline metric"
  - ❌ Missing color/style details: "A button" → ✅ "A blue primary button with rounded corners and white text"
  - ❌ Describing ALL elements equally → ✅ Focus on the selected element, mention others for context
  - ❌ Ignoring the business purpose: "A div with text" → ✅ "A revenue summary section showing monthly performance metrics"

  <example_1>
    - user:
        YOUR_TASK: Describe the following HTML element in a natural language description.
        ${exampleElement}

    - assistant:
        A revenue dashboard card displaying the current month's financial performance. The card features a white background in light mode and dark zinc background in dark mode, with rounded corners and a subtle shadow for depth. At the top, there's a header section with "Monthly Revenue" as the title aligned to the left, and a green-tinted badge showing "+12.5%" growth indicator on the right. The main content prominently displays "$54,239" as the current monthly revenue figure in large, bold typography. Below this, a comparison text states "Compared to $48,211 last month" in a muted gray color, providing context for the growth percentage. At the bottom, there are two action buttons: a primary blue "View Details" button that likely navigates to a detailed revenue breakdown page, and a secondary outlined "Export" button for downloading or exporting the revenue data. The entire component uses a consistent color scheme with proper dark mode support throughout, and the layout uses flexbox for alignment and spacing.
  </example_1>

  <example_2>
    - user:
        YOUR_TASK: Describe the following HTML element in a natural language description.
        ${exampleElement2}

    - assistant:
        A product analytics conversion funnel card displaying user journey metrics over the last 7 days. The card has a clean, modern design with a white background in light mode and dark slate background in dark mode, featuring rounded corners and a subtle shadow. At the top, there's a bold "Conversion Funnel" title on the left with a small "Last 7 days" time period badge on the right in a muted slate color. The main content shows three distinct funnel steps, each with its own color-coded design. The first step "Page View" has a blue accent with a left border, showing 12,458 users representing 100% of the funnel entry point. The second step "Add to Cart" uses an amber/orange theme, displaying 3,847 users which represents a 30.9% conversion rate from the previous step. The final step "Completed Purchase" features a green accent, showing 1,923 users with a 15.4% conversion rate. Each step is contained in a horizontally-aligned card with the step name on the left and metrics (count and percentage) on the right in large, bold typography. The percentage badges are color-matched to their respective steps. The entire component uses consistent spacing, proper dark mode support, and clear visual hierarchy to help users quickly understand their conversion funnel performance.
  </example_2>

  REMEMBER: Your description will be used to find the source code for this UI element, so include enough specific details (text content, styling, structure) to make it uniquely identifiable.`;

  const elementSnippet = htmlElementToContextSnippet([element]);

  const prompt = {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `YOUR_TASK: Describe the following HTML element in a natural language description. \n\n${elementSnippet}`,
      },
    ],
  } satisfies ModelMessage;

  const elementDescription = await generateText({
    model,
    messages: [{ role: 'system', content: descriptionPrompt }, prompt],
    temperature: 0.1,
  });

  const retrievedFiles = await queryRagWithoutRerank(
    elementDescription.text,
    workspaceDataPath,
    apiKey,
    20,
  );

  return { retrievedFiles, elementDescription: elementDescription.text };
}

/**
 * Example 1: Main component with child component dependency
 * Shows the model should return both the main page and the imported component
 */
const fileSelectionExample1 = {
  userInput: `This is the natural language description of the selected element:
    ---
    A pricing page header section with a title "Simple, transparent pricing" and a "New" badge, wrapped in a ScrollReveal animation component for smooth reveal on scroll.
    ---

  This is the HTML element structure:
    ---
    <html-element type="div" role="selected-element" selected="true" depth="0" xpath="/html/body/main/div/div">
    <div className="flex flex-col items-center gap-4 text-center"></div>
    </html-element>

    <html-element type="h1" role="child" depth="1" xpath="/html/body/main/div/div/h1">
    <h1 className="bg-gradient-to-tr from-zinc-900 via-zinc-700 to-black bg-clip-text font-bold text-3xl text-transparent tracking-tight">Simple, transparent pricing</h1>
    </html-element>
    ---

  These are the file snippets you should pick all relevant ones from:
    [
      {
        "relativePath": "apps/website/src/app/(home)/pricing/page.tsx",
        "content": "FRONTEND FILE: page.tsx\\n\\nexport default function PricingPage() {\\n  return (\\n    <div className=\\"flex w-full max-w-6xl flex-col gap-12 px-4\\">\\n      <ScrollReveal>\\n        <div className=\\"flex flex-col items-center gap-4 text-center\\">\\n          <h1 className=\\"bg-gradient-to-tr from-zinc-900 via-zinc-700 to-black bg-clip-text font-bold text-3xl\\">\\n            Simple, transparent pricing\\n          </h1>\\n        </div>\\n      </ScrollReveal>\\n    </div>\\n  );\\n}",
        "startLine": 5,
        "endLine": 22
      },
      {
        "relativePath": "apps/website/src/components/scroll-reveal.tsx",
        "content": "FRONTEND FILE: scroll-reveal.tsx\\n\\nexport function ScrollReveal({ children }: { children: React.ReactNode }) {\\n  return (\\n    <motion.div\\n      initial={{ opacity: 0, y: 20 }}\\n      whileInView={{ opacity: 1, y: 0 }}\\n    >\\n      {children}\\n    </motion.div>\\n  );\\n}",
        "startLine": 3,
        "endLine": 15
      },
      {
        "relativePath": "apps/website/src/app/dashboard/page.tsx",
        "content": "FRONTEND FILE: page.tsx\\n\\nexport default function DashboardPage() {\\n  return <div>Dashboard</div>;\\n}",
        "startLine": 1,
        "endLine": 5
      }
    ]`,
  assistantResponse: `[
  {
    "relativePath": "apps/website/src/app/(home)/pricing/page.tsx",
    "startLine": 5,
    "endLine": 22
  },
  {
    "relativePath": "apps/website/src/components/scroll-reveal.tsx",
    "startLine": 3,
    "endLine": 15
  }
]`,
  explanation:
    'CORRECT: Returns the main pricing page AND the ScrollReveal component it uses. Excludes the unrelated dashboard page.',
};

/**
 * Example 2: Only main component, no dependencies visible
 * Shows the model should return ONLY directly relevant files
 */
const fileSelectionExample2 = {
  userInput: `This is the natural language description of the selected element:
    ---
    A simple blue button with rounded corners and white text saying "Submit Form". It's a primary action button with hover effects.
    ---

  This is the HTML element structure:
    ---
    <html-element type="button" role="selected-element" selected="true" depth="0" selector=".bg-blue-500.hover:bg-blue-600.text-white.rounded.px-4.py-2" xpath="/html/body/main/form/button">
    <button className="bg-blue-500 hover:bg-blue-600 text-white rounded px-4 py-2">Submit Form</button>
    </html-element>
    ---

  These are the file snippets you should pick all relevant ones from:
    [
      {
        "relativePath": "src/components/forms/contact-form.tsx",
        "content": "FRONTEND FILE: contact-form.tsx\\n\\nexport function ContactForm() {\\n  return (\\n    <form>\\n      <button className=\\"bg-blue-500 hover:bg-blue-600 text-white rounded px-4 py-2\\">\\n        Submit Form\\n      </button>\\n    </form>\\n  );\\n}",
        "startLine": 10,
        "endLine": 20
      },
      {
        "relativePath": "src/utils/form-validation.ts",
        "content": "UTILITY FILE: form-validation.ts\\n\\nexport function validateEmail(email: string) {\\n  return /^[^\\\\s@]+@[^\\\\s@]+\\\\.[^\\\\s@]+$/.test(email);\\n}",
        "startLine": 1,
        "endLine": 5
      },
      {
        "relativePath": "src/components/layout/header.tsx",
        "content": "FRONTEND FILE: header.tsx\\n\\nexport function Header() {\\n  return <header>Header</header>;\\n}",
        "startLine": 1,
        "endLine": 5
      }
    ]`,
  assistantResponse: `[
  {
    "relativePath": "src/components/forms/contact-form.tsx",
    "startLine": 10,
    "endLine": 20
  }
]`,
  explanation:
    'CORRECT: Returns ONLY the contact form file. The validation utility is not used in the rendered button, and the header is unrelated.',
};

/**
 * Example 3: No matching files - should return empty array
 * Shows the model should confidently return [] when nothing matches
 */
const fileSelectionExample3 = {
  userInput: `This is the natural language description of the selected element:
    ---
    A dark-themed analytics dashboard card showing a conversion funnel with three steps: Page View (12,458 users), Add to Cart (3,847 users), and Completed Purchase (1,923 users). Each step has color-coded badges and percentage indicators.
    ---

  This is the HTML element structure:
    ---
    <html-element type="div" role="selected-element" selected="true" depth="0" selector=".analytics-card.border.border-slate-200.dark:border-slate-800" xpath="/html/body/main/div[2]">
    <div className="analytics-card border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-6 shadow-sm"></div>
    </html-element>

    <html-element type="h3" role="child" depth="2" xpath="/html/body/main/div[2]/div/h3">
    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Conversion Funnel</h3>
    </html-element>

    <html-element type="span" role="child" depth="4" xpath="/html/body/main/div[2]/div[2]/div[1]/div/span[1]">
    <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">12,458</span>
    </html-element>
    ---

  These are the file snippets you should pick all relevant ones from:
    [
      {
        "relativePath": "src/components/auth/login-form.tsx",
        "content": "FRONTEND FILE: login-form.tsx\\n\\nLogin form component code...",
        "startLine": 1,
        "endLine": 30
      },
      {
        "relativePath": "src/pages/settings.tsx",
        "content": "FRONTEND FILE: settings.tsx\\n\\nSettings page code...",
        "startLine": 1,
        "endLine": 50
      }
    ]`,
  assistantResponse: '[]',
  explanation:
    'CORRECT: Returns empty array because none of the provided files are related to the analytics dashboard element.',
};

async function pickCorrectFileSnippetsFromSnippets(
  element: SelectedElement,
  clientRuntime: ClientRuntime,
  snippets: RetrievalResult[],
  elementDescription: string,
  model: LanguageModelV2,
  onError?: (error: string) => void,
) {
  const cleanedSnippets: {
    relativePath: string;
    content: string;
    startLine: number;
    endLine: number;
  }[] = [];

  for (const snippet of snippets) {
    const _startLine = snippet.startLine - 500;
    const _endLine = snippet.endLine + 500;
    const startLine = Math.max(1, _startLine);
    const endLine = _endLine;

    const fileContent = await clientRuntime.fileSystem.readFile(
      snippet.relativePath,
      { startLine, endLine },
    );
    if (!fileContent.success || !fileContent.content) {
      onError?.(
        `Failed to read file ${snippet.relativePath}: ${fileContent.error} ${fileContent.message}`,
      );
      cleanedSnippets.push({
        relativePath: snippet.relativePath,
        content: snippet.content,
        startLine: snippet.startLine,
        endLine: snippet.endLine,
      });
    }
    cleanedSnippets.push({
      relativePath: snippet.relativePath,
      content: fileContent.content!,
      startLine: snippet.startLine,
      endLine: snippet.endLine,
    });
  }

  // Merge multiple chunks from the same file into one entry
  const fileToChunks = new Map<
    string,
    Array<{
      relativePath: string;
      content: string;
      startLine: number;
      endLine: number;
    }>
  >();

  for (const snippet of cleanedSnippets) {
    if (!fileToChunks.has(snippet.relativePath))
      fileToChunks.set(snippet.relativePath, []);

    fileToChunks.get(snippet.relativePath)!.push(snippet);
  }

  const mergedSnippets = Array.from(fileToChunks.entries()).map(
    ([relativePath, chunks]) => {
      if (chunks.length === 1) return chunks[0]!;

      // Sort chunks by line number
      const sortedChunks = chunks.sort((a, b) => a.startLine - b.startLine);

      // Merge content with clear separation
      const mergedContent = sortedChunks
        .map((c) => c.content)
        .join('\n\n[...more content from same file...]\n\n');

      return {
        relativePath,
        content: mergedContent,
        startLine: Math.min(...chunks.map((c) => c.startLine)),
        endLine: Math.max(...chunks.map((c) => c.endLine)),
      };
    },
  );

  const snippetsWithLineNumbers = mergedSnippets.map((s) => {
    const lines = s.content.split('\n');
    let codeStartIndex = -1;

    // Find the line with "Code:" followed by "---"
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i]?.includes('Code:') && lines[i + 1]?.trim() === '---') {
        codeStartIndex = i + 2; // Start after the "---" line
        break;
      }
    }

    const numberedLines = lines.map((line, index) => {
      if (codeStartIndex >= 0 && index >= codeStartIndex) {
        const lineNumber = index + 1;
        return `${lineNumber}: ${line}`;
      }
      return `${index + 1}: ${line}`;
    });

    return {
      relativePath: s.relativePath,
      startLine: s.startLine,
      endLine: s.endLine,
      content: numberedLines.join('\n'),
    };
  });

  const fileSelectionPrompt = `
  ROLE: You are an expert at identifying which source code files are responsible for rendering specific UI elements in a web application.

  CONTEXT: You receive:
  1. A natural language description of a UI element from a browser
  2. The HTML element structure with attributes, classes, and hierarchy (in <html-element> XML format)
  3. A list of candidate file snippets retrieved from the codebase
  4. Your job is to identify which files DIRECTLY render or define that UI element

  YOUR_TASK: Return a JSON array of the file snippets that contain the source code for the described UI element. Use BOTH the description and the concrete HTML structure (element type, classes, text content) to make precise matches. Only include files that directly render the element.

  CRITICAL RULES:
  1. NEVER return the same file path more than once (duplicates are always wrong)
  2. INCLUDE the main component/page file that renders the element
  3. INCLUDE child components that are explicitly used in the element's markup
  4. EXCLUDE unrelated files even if they have similar names or patterns
  5. Return an EMPTY ARRAY [] if none of the provided files match the element description
  6. When files are merged (multiple chunks), return ONE entry per file with the merged line range

  OUTPUT FORMAT: A JSON array of objects with "relativePath", "startLine", and "endLine" fields.

  MATCHING CRITERIA - A file is relevant if it:
  ✅ Contains the exact text content shown in the HTML element (e.g., "Submit Form", "12,458 users")
  ✅ Has matching className patterns from the HTML element (e.g., "bg-blue-500 text-white rounded")
  ✅ Renders the same element type at the same structural position (e.g., <button>, <h1>, <div>)
  ✅ Defines a component explicitly mentioned in the description or used in the markup
  ✅ Is the parent page/component that renders the described element
  
  MATCHING STRATEGY:
  1. First, look for exact text matches between the HTML element and file content
  2. Then, match className patterns (look for similar Tailwind/CSS classes)
  3. Verify the element type matches (button in HTML → <button> in code)
  4. Check if any child component names appear in both the description and file imports

  COMMON MISTAKES TO AVOID:
  ❌ Returning the same file path multiple times (even with different line ranges)
  ❌ Including unrelated pages because they have similar structure

  EXAMPLES:

  <example_1>
    - user: ${fileSelectionExample1.userInput}
    
    - assistant: ${fileSelectionExample1.assistantResponse}
    
    ${fileSelectionExample1.explanation}
  </example_1>

  <example_2>
    - user: ${fileSelectionExample2.userInput}
    
    - assistant: ${fileSelectionExample2.assistantResponse}
    
    ${fileSelectionExample2.explanation}
  </example_2>

  <example_3>
    - user: ${fileSelectionExample3.userInput}
    
    - assistant: ${fileSelectionExample3.assistantResponse}
    
    ${fileSelectionExample3.explanation}
  </example_3>

  QUALITY CHECKLIST before responding:
  - Did I check for duplicate file paths? (There should be ZERO duplicates)
  - Does each file directly render the described UI element?
  - Would a developer looking at these files immediately recognize the described element?
  `;

  // Generate HTML element snippet for better matching
  const elementSnippet = htmlElementToContextSnippet([element]);

  const prompt = {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `This is the natural language description of the selected element:
    ---
    ${elementDescription}
    ---

  This is the HTML element structure:
    ---
    ${elementSnippet}
    ---

  These are the file snippets you should pick all relevant ones from:
    ${JSON.stringify(
      snippetsWithLineNumbers.map((s) => ({
        relativePath: s.relativePath,
        content: s.content.substring(0, 1500), // Limit content to prevent token overflow
        startLine: s.startLine,
        endLine: s.endLine,
      })),
      null,
      2,
    )}`,
      },
    ],
  } satisfies ModelMessage;

  try {
    const response = await generateObject({
      schema: z.object({
        elements: z.array(
          z.object({
            relativePath: z.string(),
            startLine: z.number(),
            endLine: z.number(),
          }),
        ),
      }),
      model,
      messages: [{ role: 'system', content: fileSelectionPrompt }, prompt],
      temperature: 0.1,
    });

    // Deduplicate results by relativePath (in case model makes mistakes)
    const seen = new Set<string>();
    const deduplicated = response.object.elements.filter((element) => {
      if (seen.has(element.relativePath)) {
        onError?.(
          `Warning: Model returned duplicate file path: ${element.relativePath}. Removing duplicate.`,
        );
        return false;
      }
      seen.add(element.relativePath);
      return true;
    });

    // Log if we got too many results (might indicate poor filtering)
    if (deduplicated.length > 5) {
      onError?.(
        `Warning: Model returned ${deduplicated.length} files, which seems excessive. Consider reviewing the results.`,
      );
    }

    return deduplicated;
  } catch (_e) {
    onError?.(`Failed to pick correct file snippets from snippets: ${_e}`);
    return [];
  }
}

/**
 * Retrieves the context files from the selected element.
 * @param element The element to get the context files from.
 * @param apiKey The API key to use for the LLM.
 * @param workspaceDataPath The path to the workspace data.
 * @returns An array of context files with their file paths and line number ranges.
 */
export async function getContextFilesFromSelectedElement(
  element: SelectedElement,
  apiKey: string,
  workspaceDataPath: string,
  model: LanguageModelV2,
  clientRuntime: ClientRuntime,
  onError?: (error: string) => void,
): Promise<{ relativePath: string; startLine: number; endLine: number }[]> {
  try {
    const { retrievedFiles, elementDescription } =
      await retrieveFilesForSelectedElement(
        element,
        workspaceDataPath,
        model,
        apiKey,
      );

    const correctFileSnippets = await pickCorrectFileSnippetsFromSnippets(
      element,
      clientRuntime,
      retrievedFiles.map((f) => ({
        relativePath: f.relative_path,
        content: f.content,
        startLine: f.start_line,
        endLine: f.end_line,
      })),
      elementDescription,
      model,
      onError,
    );

    return correctFileSnippets;
  } catch (_e) {
    onError?.(`Failed to get context files from selected element: ${_e}`);
    return [];
  }
}
