// Who am I? Game - PWA Installation and Service Worker Management
// debugLog and getText come from utils.js (loaded before this file)
/* global debugLog, getText */

class PWAManager {
    constructor() {
        this.init();
    }

    init() {
        // Register service worker
        this.registerServiceWorker();

        // Say in the debug log whether the game runs as an installed app
        this.checkInstallation();
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                debugLog('✅ Service Worker registered successfully:', registration.scope);

                // Handle updates
                registration.addEventListener('updatefound', () => {
                    debugLog('🔄 New service worker version available');
                    const newWorker = registration.installing;

                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            this.showUpdateAvailable();
                        }
                    });
                });

                // Start auto-update checking
                this.startUpdateChecking(registration);

            } catch (error) {
                console.error('❌ Service Worker registration failed:', error);
            }
        } else {
            debugLog('🚫 Service Worker not supported');
        }
    }

    checkInstallation() {
        // Check if running in standalone mode (for logging purposes)
        if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
            debugLog('📱 App is running in standalone mode');
        }

        // Check if running as PWA on iOS
        if (window.navigator.standalone) {
            debugLog('🍎 App is running in iOS standalone mode');
        }
    }

    // Auto-update checking
    startUpdateChecking(registration) {
        // Check for updates every 30 seconds (silently - no console spam)
        setInterval(() => {
            registration.update();
        }, 30000);

        // Also check when page becomes visible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                registration.update();
            }
        });
    }

    // Show update available notification
    showUpdateAvailable() {
        debugLog('🆕 App update is available!');

        const updateBanner = document.createElement('div');
        updateBanner.className = 'alert alert-warning alert-dismissible fade show';

        // Get localized text (fallback to English if i18n not available)
        const updateAvailableText = getText('updateAvailable', '🆕 Update Available!');
        const updateDescriptionText = getText('updateDescription', 'A new version of the app is ready. Reload to get the latest features.');
        const updateNowText = getText('updateNow', 'Update Now');
        const closeText = getText('close', 'Close');

        updateBanner.innerHTML = `
            <div class="d-flex align-items-center">
                <div class="flex-grow-1">
                    <strong>${updateAvailableText}</strong><br>
                    <small>${updateDescriptionText}</small>
                </div>
                <div class="ms-3"></div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="alert" data-i18n-aria-label="close" aria-label="${closeText}"></button>
        `;

        // A listener, not onclick="...": the pages run no inline code (CSP)
        const updateButton = document.createElement('button');
        updateButton.type = 'button';
        updateButton.className = 'btn btn-warning btn-sm';
        updateButton.textContent = updateNowText;
        updateButton.addEventListener('click', () => window.location.reload());
        updateBanner.querySelector('.ms-3').append(updateButton);

        const container = document.querySelector('.container');
        if (container) {
            container.insertAdjacentElement('afterbegin', updateBanner);
        }
    }

    // Force update method
    async forceUpdate() {
        try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
                debugLog('🔄 Forcing service worker update...');
                await registration.update();

                // Send message to service worker to skip waiting
                if (registration.waiting) {
                    registration.waiting.postMessage('CHECK_UPDATE');
                }

                // Reload page after a short delay
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            }
        } catch (error) {
            console.error('❌ Error forcing update:', error);
        }
    }
}

// Initialize PWA manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.pwaManager = new PWAManager();
});

// Global helper function for force updates (can be called from console)
window.forceAppUpdate = () => {
    if (window.pwaManager) {
        window.pwaManager.forceUpdate();
    } else {
        // Typed by hand in the console: always answer
        console.warn('PWA Manager not initialized yet');
    }
};