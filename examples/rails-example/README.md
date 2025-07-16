# Rails + Stagewise Example

This is a modern Rails 8 application demonstrating integration with Stagewise toolbar for visual AI-assisted development. Built with Tailwind CSS for beautiful, responsive styling.

## Features

- **Rails 8**: Latest Rails with Hotwire (Turbo + Stimulus)
- **Stagewise Integration**: Visual element selection and AI-powered coding
- **Tailwind CSS**: Modern utility-first CSS framework
- **bin/dev**: Rails-standard development workflow
- **Foreman**: Process management for concurrent development servers
- **Stimulus Controllers**: Interactive JavaScript components

## Setup

### Prerequisites

- Ruby 3.1+
- Node.js 18+ (for Stagewise toolbar)
- Rails 8.0+
- Bundler

### Installation

1. **Install dependencies:**
   ```bash
   bundle install
   npm install
   ```

2. **Install Stagewise VSCode Extension** (if not already installed):
   - **Cursor**: [cursor:extension/stagewise.stagewise-vscode-extension](cursor:extension/stagewise.stagewise-vscode-extension)
   - **VS Code**: [vscode:extension/stagewise.stagewise-vscode-extension](vscode:extension/stagewise.stagewise-vscode-extension)

3. **Start the development server:**
   ```bash
   # From the monorepo root
   pnpm dev:rails
   
   # Or from this directory
   ./bin/dev
   ```

   The `bin/dev` script will start:
   - Rails server on port 3009
   - Tailwind CSS file watcher for live CSS updates

4. **Visit the application:**
   Open [http://localhost:3009](http://localhost:3009) in your browser

## How It Works

### Stagewise Integration

The Stagewise toolbar is integrated in the application layout (`app/views/layouts/application.html.erb`):

```erb
<% if Rails.env.development? %>
  <script type="module">
    import { initToolbar } from '@stagewise/toolbar';
    
    document.addEventListener('DOMContentLoaded', () => {
      const stagewiseConfig = {
        plugins: [] // Ready for Rails-specific plugins
      };
      
      initToolbar(stagewiseConfig);
    });
  </script>
<% end %>
```

### Tailwind CSS Setup

This example uses `tailwindcss-rails` for seamless Rails integration:

- **Configuration**: `tailwind.config.js` with Rails-specific content paths
- **Styles**: `app/assets/stylesheets/application.tailwind.css` 
- **Build Process**: Managed by `bin/dev` through Procfile.dev

### Demo Components

- **Interactive Counter**: Stimulus controller demonstrating real-time updates
- **Responsive Design**: Mobile-first Tailwind utility classes
- **Modern UI**: Gradient backgrounds, glassmorphism effects, and smooth animations
- **Rails + Stagewise Branding**: Professional logo integration

### Development Workflow

1. **Start development** with `./bin/dev`
2. **Edit views** - Tailwind classes update instantly
3. **Select elements** in browser using Stagewise toolbar
4. **Leave AI comments** about desired changes
5. **Watch AI implement** through your code editor

## Rails 8 Features Used

- **Importmap**: ES modules without complex bundling
- **Stimulus**: Unobtrusive JavaScript framework
- **Turbo**: Fast SPA-like navigation
- **Propshaft**: Modern asset pipeline
- **Hotwire**: HTML over the wire

## Tailwind CSS Features

- **Utility-First**: Rapid UI development
- **Responsive Design**: Mobile-first approach
- **Dark Mode**: Built-in dark mode support
- **Custom Components**: Organized with @layer directives
- **JIT Mode**: Just-in-time compilation

## File Structure

```
rails-example/
├── bin/
│   ├── dev                         # Main development script
│   ├── rails                       # Rails CLI
│   └── setup                       # Setup script
├── Procfile.dev                    # Development processes
├── app/
│   ├── controllers/
│   │   └── pages_controller.rb
│   ├── views/
│   │   ├── layouts/
│   │   │   └── application.html.erb # Stagewise integration
│   │   └── pages/
│   │       └── home.html.erb        # Tailwind demo page
│   ├── javascript/
│   │   ├── application.js
│   │   └── controllers/
│   │       └── counter_controller.js # Stimulus demo
│   └── assets/
│       └── stylesheets/
│           ├── application.css
│           └── application.tailwind.css # Tailwind base
├── config/
│   ├── application.rb
│   ├── routes.rb
│   └── importmap.rb               # JavaScript imports
├── tailwind.config.js             # Tailwind configuration
├── package.json                   # Uses ./bin/dev
└── turbo.json                     # Monorepo configuration
```

## Development Commands

```bash
# Start development with hot reloading
./bin/dev

# Run Rails server only
bin/rails server -p 3009

# Build CSS for production
bin/rails assets:precompile

# Install/update dependencies
./bin/setup

# Clean temporary files
npm run clean
```

## Styling with Tailwind

The homepage showcases modern Tailwind patterns:

```erb
<!-- Gradient background -->
<div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">

<!-- Glassmorphism cards -->
<div class="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl">

<!-- Hover animations -->
<div class="transform hover:scale-105 transition-all duration-200">

<!-- Responsive grid -->
<div class="grid md:grid-cols-3 gap-8">
```

## Customization

### Adding Rails-Specific Plugins

When Rails-specific Stagewise plugins become available:

```javascript
const stagewiseConfig = {
  plugins: [
    RailsPlugin // Future Rails-specific plugin
  ]
};
```

### Extending Tailwind

Add custom components in `application.tailwind.css`:

```css
@layer components {
  .btn-primary {
    @apply px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transform hover:scale-105 transition-all duration-200;
  }
}
```

## Troubleshooting

### Stagewise Toolbar Issues

1. **Toolbar not appearing**:
   - Check development environment (`Rails.env.development?`)
   - Verify Stagewise extension is installed and enabled
   - Ensure you're on the correct port (3009)

2. **Import errors**:
   - Check `config/importmap.rb` for `@stagewise/toolbar` pin
   - Verify the import in the layout script

### Tailwind CSS Issues

1. **Styles not updating**:
   - Ensure `bin/dev` is running (not just `rails server`)
   - Check `tailwind.config.js` content paths
   - Verify `application.tailwind.css` is being loaded

2. **Build errors**:
   - Check `tailwindcss-rails` gem is installed
   - Verify `Procfile.dev` has correct CSS watcher command

### Rails Server Issues

1. **Port conflicts**:
   - Default port is 3009 (set in `config/puma.rb`)
   - Use `PORT=3010 ./bin/dev` to override

2. **Foreman not found**:
   - Install with `gem install foreman`
   - Or use `bundle exec foreman start -f Procfile.dev`

## Learn More

- [Rails 8 Guide](https://guides.rubyonrails.org/)
- [Stagewise Documentation](https://docs.stagewise.io/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Stimulus Handbook](https://stimulus.hotwired.dev/)
- [Turbo Reference](https://turbo.hotwired.dev/)

## Contributing

This example is part of the [Stagewise monorepo](https://github.com/stagewise-io/stagewise). Contributions are welcome!

## License

This example follows the same license as the Stagewise project - AGPLv3.