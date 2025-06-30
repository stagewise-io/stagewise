## Description

This PR adds a copy button to the toolbar's chat interface, allowing users to copy the formatted prompt to their clipboard for use with any AI tool.

## Changes

- ✨ Added copy button next to the send button in the chat interface
- 📋 Implemented copy functionality that formats the complete prompt including:
  - User input text
  - Current page URL
  - Selected DOM elements (if any)
  - Plugin context snippets
- 🎨 Added visual feedback with icon animation (CopyIcon → CheckIcon)
- 💅 Styled with zinc-600 color to differentiate from the send button

## Screenshots/Demo

The copy button appears to the left of the send button when there's content in the textarea:
- Default state: Gray copy icon
- Hover state: Darker gray with hover effect
- Success state: Green check icon (reverts after 1.5s)

## Testing

- [x] Tested copy functionality with text input
- [x] Tested copy with DOM elements selected
- [x] Tested visual feedback and icon transitions
- [x] Verified copied content format in external editors
- [x] Tested edge cases (empty input, during loading state)

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [x] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Checklist

- [x] My code follows the style guidelines of this project
- [x] I have performed a self-review of my code
- [x] I have tested my changes locally
- [x] My changes generate no new warnings
- [x] I have run linting and formatting checks