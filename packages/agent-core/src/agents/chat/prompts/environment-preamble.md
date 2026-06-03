# Environment

## State & Events

- Initial state: rendered inside `<environment>` below — each section reflects the current snapshot at conversation start.
- Changes: `<env-changes>` containing `<entry>` events. These indicate state changes, **NOT** user intent.

## Visual Perception

You can **see** images and screenshots. This is multimodal input — image data is injected directly into your context as visual content you perceive, not as text descriptions.

| Action | How | What happens |
|--------|-----|-------------|
| **See an image file** | Use the `read` tool on any image path (workspace files, attachments) | Image is converted and injected as inline visual content you can see |

Additional ways to capture images, when available, are documented below.
