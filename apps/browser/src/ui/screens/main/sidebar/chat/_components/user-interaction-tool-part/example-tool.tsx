// /**
//  * Example User-Input Tool UI Component Template
//  *
//  * This file serves as a template for implementing UI components for user-input tools.
//  * Each user-input tool needs a corresponding UI component that:
//  * 1. Renders the input parameters from the tool
//  * 2. Provides UI controls for user interaction (buttons, inputs, etc.)
//  * 3. Calls onSubmit with the result when the user completes the interaction
//  * 4. Calls onCancel when the user cancels the interaction
//  *
//  * To create a new user-input tool UI:
//  * 1. Copy this file and rename it to match your tool
//  * 2. Update the component name and types
//  * 3. Implement the UI based on your tool's input/output schemas
//  * 4. Register the component in index.tsx
//  */

// import { memo, useMemo } from 'react';
// import { Button } from '@stagewise/stage-ui/components/button';
// import type { PickToolPart } from './index.js';
// import { CheckIcon, XIcon } from 'lucide-react';
// import type { ExampleUserInputOutput } from '@stagewise/agent-tools';

// export const ExampleUserInputToolPartContent = memo(
//   ({
//     toolPart,
//     onSubmit,
//     onCancel,
//   }: {
//     /** The tool part containing input params and current state */
//     toolPart: PickToolPart<'tool-exampleUserInputTool'>;
//     /** Called when user completes the interaction */
//     onSubmit: (
//       input: ExampleUserInputOutput & { type: 'exampleUserInputTool' },
//     ) => void;
//     /** Called when user cancels the interaction */
//     onCancel: () => void;
//   }) => {
//     const isError = useMemo(() => {
//       return toolPart.state === 'output-error';
//     }, [toolPart.state]);

//     const isInputAvailable = useMemo(() => {
//       return toolPart.state === 'input-available';
//     }, [toolPart.state]);

//     const isOutputAvailable = useMemo(() => {
//       return toolPart.state === 'output-available';
//     }, [toolPart.state]);

//     // Access the input parameters from the tool
//     // These come from the exampleUserInputParamsSchema defined in the tool
//     const exampleParam = toolPart.input?.userInput?.exampleParam ?? '';

//     return (
//       <div className="flex w-full flex-col gap-2">
//         {/* Display the input parameter(s) from the tool */}
//         <span className="mb-2 rounded-lg bg-muted-foreground/10 p-2 text-muted-foreground text-sm">
//           {exampleParam || 'No input provided'}
//         </span>

//         {/* Action buttons - shown when input is available */}
//         {isInputAvailable && (
//           <div className="flex w-full flex-row items-center justify-end gap-2">
//             <Button variant="ghost" size="xs" onClick={onCancel}>
//               Cancel
//             </Button>
//             <Button
//               variant="primary"
//               size="xs"
//               onClick={() => {
//                 // Submit the result back to the tool
//                 // The shape must match exampleUserInputOutputSchema
//                 onSubmit({
//                   result: exampleParam,
//                   type: 'exampleUserInputTool',
//                 });
//               }}
//             >
//               Confirm
//             </Button>
//           </div>
//         )}

//         {/* Success indicator */}
//         {isOutputAvailable && (
//           <div className="flex w-full flex-row items-center justify-end gap-2">
//             <CheckIcon className="size-3 text-success-foreground" />
//           </div>
//         )}

//         {/* Error indicator */}
//         {isError && (
//           <div className="flex w-full flex-row items-center justify-end gap-2">
//             <XIcon className="size-3 text-error-foreground" />
//           </div>
//         )}
//       </div>
//     );
//   },
// );
