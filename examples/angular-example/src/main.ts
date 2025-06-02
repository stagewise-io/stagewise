import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { initToolbar } from '@stagewise/toolbar';

// Only initialize in development mode (customize as needed)
if (!('production' in window) || !window.production) {
  initToolbar();
}

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error(err),
);
