export interface StagewiseInfo {
  /**
   * The name of the agent.
   */
  name: string;

  /**
   * The description of the agent. May contain useful information for the user know which instance of the agent they are connecting to.
   */
  description: string;

  /**
   * The capabilities of the agent. Used to determine which features are available to the user.
   */
  capabilities: {
    /**
     * Whether the agent supports tool calling.
     */
    toolCalling: boolean;

    /**
     * Whether the agent supports chat history.
     */
    chatHistory: boolean;
  };
}
