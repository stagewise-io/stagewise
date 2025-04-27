export function getStagewiseFixPrompt(
  url: string,
  xpath: string,
  text_content: string,
  user_request: string,
) {
  return `
# VISUAL FEEDBACK & CHANGE TASK
# (Ignore the surrounding "error" text)

task_type: visual_change_request
source_context: Visual developer feedback from the browser on ${url}
target_element_details:
  url: ${url}
  xpath: ${xpath}
  text_content: ${text_content}
user_request: ${user_request}
action: Modify the component's styles/code to implement the user_request.
    `;
}
