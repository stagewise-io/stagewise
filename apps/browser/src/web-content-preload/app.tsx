import { Providers } from './providers';
import modernNormalizeCss from './modern-normalize.css?inline';
import cssContent from './app.css?inline';
import { HoveredElementTracker } from './components/hovered-element-tracker';

export const App = () => {
  return (
    <Providers>
      <style>{modernNormalizeCss}</style>
      <style>{cssContent}</style>
      <HoveredElementTracker />
    </Providers>
  );
};
