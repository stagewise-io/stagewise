import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { initToolbar } from '@stagewise/toolbar';
import { AngularPlugin } from '@stagewise-plugins/angular';

// Only initialize in development mode (customize as needed)
if (!('production' in window) || !window.production) {
  initToolbar({
    plugins: [
      {
        ...AngularPlugin,
        onPromptTransmit: (prompt) => {
          // copy to clipboard
          void navigator.clipboard.writeText(`prompt: ${prompt}`);
        },
      } satisfies typeof AngularPlugin,
    ],
  });
}

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error(err),
);
