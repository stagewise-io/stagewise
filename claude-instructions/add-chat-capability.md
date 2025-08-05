# Summary

The job is to add an additional capability to the stagewise agent interface package.
Up until now, the existing "messaging" capability only focusses on sending over bulk user messages as well as full or partial single agent messages. New messages would always replace old ones. The new "chat" capability is responsible for providing the agent interface with proper chat history functionality. While the synchronization mechanism between agent and toolbar should still look very much the same as in the messaging capability, the data that is exchanged should align it's format way more with existing solutions out there.
The job is to implement and thoroughly test this new "chat" capability just as well as the existing messaging capability. Additionally, the "agent" adapter should be extended to offer an easy to use functional interface for implementations of agents to work with said chat capability.

# Specification

## Removal of old toolCalling capability

Delete the old toolCalling capability since it will now be covered by the functionalities in the new chat capability.

## Synchronization mechanism

- The task of the agent-interface is to provide the toolbar with all the necessary state it needs to render information for the user.
- The toolbar itself is mostly stateless and doesn't preserve any data regarding the agent between page reloads etc.
- It is thus super important that the agent-side controls what is shown in the chat and somehow synchronizes this to the toolbar in a very efficient manner.
- Similarly to the "messaging" capability, the API should be able to incrementally update the content rendered in the toolbar without using to much bandwidth between toolbar and agent.

## Chat capability

### Multi-Chat functionality

- The agent-interface should give a list of chats that were previously created.
- The user should be able to create a new chat without much hassle.
- The agent may reject the creation of new chats.
- The agent may also reject the user switching over to another chat (e.g. the agent is still running)
- The user writes messages only to one chat
- The user should also be able to delete chats

### Message types

- The messages that are exchanged between the user and the agent are one of four types:
  - "UserMessage": Will always be sent by the user from the side of the toolbar. It's structure should replicate the following reference type from the vercel AI-SDK, but include the known metadata object that's also used in the messaging-capability:
    - The AI-SDK "UserMessage" type looks like this: ```
        type UserModelMessage = {
        role: 'user';
        content: UserContent;
        };

        type UserContent = Array<TextPart | ImagePart | FilePart>;
        ´´´
    - The metadata types are found in the `agent-interface` package
    - User messages can contain of parts with text, images and files.
    - Browser and selected element metadata will always be sent along with every message.
    - UserMessages could also consist of approvals or rejections of tool calls that request approval from the user
  - "AssistantMessage": Will always be sent from the agent-side.
    - The Vercel AI-SDK describes AssistantMessages with the following types: ```
        type AssistantModelMessage = {
        role: 'assistant';
        content: AssistantContent;
        };

        interface ToolCallPart<InputArgsType> {
        type: 'tool-call';
        toolCallId: string;
        toolName: string;
        input: InputArgType;
        }

        interface ReasoningPart {
        type: 'reasoning';
        text: string;
        }

        interface TextPart {
        type: 'text';
        text: string;
        }

        interface FilePart {
        type: 'file';
        data: string; // Base64 encoded dataURL
        filename?: string;
        mimeType: string; // mimeType of the file
        }

        interface ToolResultPart<OutputType> {
        type: 'tool-result';
        toolCallId: string;
        toolName: string;
        output: OutputType;
        }

        type AssistantContent = Array<TextPart | FilePart | ReasoningPart | ToolCallPart | ToolResultPart>;
        ´´´
    - Assistant messages can contain of text, files, reasoning text, tool calls and results of tool calls (if the tool calls happen in the backend)
    - ToolCalls should also always include an additional entry called 'runtime' which may be 'cli', 'toolbar' or 'backend'
    - ToolCalls should also have an additional entry called 'requiresApproval' which may be true
  - "ToolMessage": These messages will be created by the cli or by the toolbar side. So they are either created in the toolbar and then transmitted over the agent-interface, or they are created by the cli and then only synchronized to the toolbar to display it there while it directly get's forwarded to the agent hosted in the cli
    - This is how the type looks like in the Vercel AI-SDK: ```
        type ToolModelMessage = {
            role: 'tool';
            content: ToolContent;
        };

        type ToolContent = Array<ToolResultPart>;
    ´´´

# Plan

Follow this plan when implementing this feature

- Parse and analyze the functionality of the existing capabilities in the API.
- Understand the requirements and specification and build a solid plan on what functionality is needed.
- Think about all implications this may have for both the toolbar and the agents that implement the agent-interface.
- Think about potential features that may also be important for this and ask the user on the opinion and wishes regarding these potential featues or necessary functions etc.
- Ask the user all questions you may potentially have about this job.
- Remove existing functionality that is not needed anymore according to the plan
- Create a multi-step plan with incremental addition of features and logic. Make intermediate commits between these steps.
  - At every state, first make sure that the new or updated functionality is well tested before committing.
