
// Window interface augmentation to handle the custom Prism event
export interface PrismInstance {
  render: (config: PrismConfig) => void;
  // Add other Prism instance methods here if needed (e.g., close, destroy)
}

// Configuration interface based on standard integration patterns
// Note: Specific keys depend on the documentation in node_modules
export interface PrismConfig {
  apiKey: string;
  scanId?: string;
  token?: string;
  screen?: string; // e.g., 'landing', 'capture'
  
  // CHECKLIST UPDATE: Container MUST allow string for ID reference
  container?: HTMLElement | string;
  
  mode?: string; // Added to support 'sandbox' or 'production' modes
  
  // URL Overrides - Providing multiple variants to ensure SDK picks one up
  apiBaseUrl?: string; 
  apiUrl?: string;
  baseUrl?: string;

  assetConfigId?: string; // Specific asset configuration ID
  
  // Translation overrides structure
  translationOverrides?: {
    [key: string]: {
      [key: string]: string;
    };
  };

  // Callbacks
  onSuccess?: (data: any) => void;
  onFailure?: (error: any) => void;
  onClose?: () => void;
}

export interface PrismEventDetail {
  prism: PrismInstance;
}

export type PrismLoadedEvent = CustomEvent<PrismEventDetail>;

declare global {
  interface WindowEventMap {
    'onPrismLoaded': PrismLoadedEvent;
  }
}
