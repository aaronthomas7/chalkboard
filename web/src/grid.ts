import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

export const gridTheme = themeQuartz.withParams({
  accentColor: '#2f5d50',
  fontFamily: 'inherit',
  fontSize: 14,
  headerBackgroundColor: '#f3efe6',
  headerFontWeight: 600,
  wrapperBorderRadius: 12,
});
