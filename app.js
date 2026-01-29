const API_BASE = '/api/proxy';
const BRAZIL_COUNTRY_ID = 73;
const GOOGLE_SERVICE_CODE = 'go';
const DEFAULT_TIMEOUT_SECONDS = 1200; // 20 minutos
const MIN_CANCEL_TIME = 120; // 2 minutos mínimo antes de poder cancelar

class TrustSMS {
    constructor() {
        this.apiKey = localStorage.getItem('apiKey') || '';
        this.autoCancelEnabled = localStorage.getItem('autoCancel') !== 'false';
        this.cancelMargin = parseInt(localStorage.getItem('cancelMargin')) || 60;
        
        this.currentActivation = null;
        this.countdownInterval = null;
        this.statusCheckInterval = null;
        this.autoCancelTimeout = null;
        this.startTime = null;
        this.totalSeconds = DEFAULT_TIMEOUT_SECONDS;
        
        this.initElements();
        this.bindEvents();
        this.init();
    }
    
    initElements() {
        // Screens
        this.setupScreen = document.getElementById('setup-screen');
        this.dashboardScreen = document.getElementById('dashboard-screen');
        
        // Setup
        this.apiKeyInput = document.getElementById('api-key-input');
        this.saveConfigBtn = document.getElementById('save-config-btn');
        
        // Dashboard
        this.balanceDisplay = document.getElementById('balance-display');
        this.settingsBtn = document.getElementById('settings-btn');
        
        // States
        this.idleState = document.getElementById('idle-state');
        this.loadingState = document.getElementById('loading-state');
        this.activeState = document.getElementById('active-state');
        this.smsState = document.getElementById('sms-state');
        this.errorState = document.getElementById('error-state');
        this.cancelledState = document.getElementById('cancelled-state');
        
        // Active state elements
        this.phoneNumberEl = document.getElementById('phone-number');
        this.copyBtn = document.getElementById('copy-btn');
        this.countdownProgress = document.getElementById('countdown-progress');
        this.countdownText = document.getElementById('countdown-text');
        this.statusText = document.getElementById('status-text');
        this.notReceivedBtn = document.getElementById('not-received-btn');
        this.getNumberBtn = document.getElementById('get-number-btn');
        
        // SMS state elements
        this.smsCodeEl = document.getElementById('sms-code');
        this.smsTextEl = document.getElementById('sms-text');
        this.copyCodeBtn = document.getElementById('copy-code-btn');
        this.confirmBtn = document.getElementById('confirm-btn');
        this.newNumberBtn = document.getElementById('new-number-btn');
        
        // Error state
        this.errorText = document.getElementById('error-text');
        this.retryBtn = document.getElementById('retry-btn');
        
        // Cancelled state
        this.cancelledReason = document.getElementById('cancelled-reason');
        this.newBtn = document.getElementById('new-btn');
        
        // Settings modal
        this.settingsModal = document.getElementById('settings-modal');
        this.settingsApiKey = document.getElementById('settings-api-key');
        this.autoCancelToggle = document.getElementById('auto-cancel-toggle');
        this.cancelMarginInput = document.getElementById('cancel-margin');
        this.saveSettingsBtn = document.getElementById('save-settings-btn');
        this.closeSettingsBtn = document.getElementById('close-settings-btn');
        
        // Toast
        this.toast = document.getElementById('toast');
    }
    
    bindEvents() {
        // Setup
        this.saveConfigBtn.addEventListener('click', () => this.saveConfig());
        this.apiKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveConfig();
        });
        
        // Dashboard
        this.getNumberBtn.addEventListener('click', () => this.getNumber());
        this.copyBtn.addEventListener('click', () => this.copyPhoneNumber());
        this.notReceivedBtn.addEventListener('click', () => this.cancelActivation('manual'));
        
        // SMS state
        this.copyCodeBtn.addEventListener('click', () => this.copyCode());
        this.confirmBtn.addEventListener('click', () => this.confirmActivation());
        this.newNumberBtn.addEventListener('click', () => this.resetToIdle());
        
        // Error state
        this.retryBtn.addEventListener('click', () => this.resetToIdle());
        
        // Cancelled state
        this.newBtn.addEventListener('click', () => this.resetToIdle());
        
        // Settings
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
    }
    
    init() {
        if (this.apiKey) {
            this.showDashboard();
            this.fetchBalance();
        } else {
            this.showSetup();
        }
    }
    
    // UI State Management
    showSetup() {
        this.setupScreen.classList.remove('hidden');
        this.dashboardScreen.classList.add('hidden');
    }
    
    showDashboard() {
        this.setupScreen.classList.add('hidden');
        this.dashboardScreen.classList.remove('hidden');
        this.showState('idle');
    }
    
    showState(state) {
        const states = ['idle', 'loading', 'active', 'sms', 'error', 'cancelled'];
        states.forEach(s => {
            const el = document.getElementById(`${s}-state`);
            if (el) el.classList.toggle('hidden', s !== state);
        });
    }
    
    // API Methods
    async apiCall(action, params = {}) {
        const queryParams = new URLSearchParams();
        queryParams.set('api_key', this.apiKey);
        queryParams.set('action', action);
        
        Object.entries(params).forEach(([key, value]) => {
            queryParams.set(key, value);
        });
        
        const url = `${API_BASE}?${queryParams.toString()}`;
        
        try {
            const response = await fetch(url);
            const text = await response.text();
            
            // Try to parse as JSON first
            try {
                return JSON.parse(text);
            } catch {
                return text;
            }
        } catch (error) {
            throw new Error('Erro de conexão');
        }
    }
    
    async fetchBalance() {
        try {
            const result = await this.apiCall('getBalance');
            
            if (typeof result === 'string' && result.startsWith('ACCESS_BALANCE:')) {
                const balance = parseFloat(result.split(':')[1]);
                this.balanceDisplay.textContent = `$${balance.toFixed(2)}`;
            } else if (result === 'BAD_KEY') {
                this.showToast('API Key inválida');
            }
        } catch (error) {
            console.error('Erro ao buscar saldo:', error);
        }
    }
    
    async getNumber() {
        this.showState('loading');
        
        try {
            const result = await this.apiCall('getNumberV2', {
                service: GOOGLE_SERVICE_CODE,
                country: BRAZIL_COUNTRY_ID
            });
            
            if (result.activationId) {
                this.currentActivation = result;
                this.startActivation();
            } else if (typeof result === 'string') {
                this.handleError(result);
            } else {
                this.handleError('UNKNOWN_ERROR');
            }
        } catch (error) {
            this.handleError(error.message);
        }
    }
    
    startActivation() {
        const phone = this.formatPhoneNumber(this.currentActivation.phoneNumber);
        this.phoneNumberEl.textContent = phone;
        
        this.startTime = Date.now();
        this.totalSeconds = DEFAULT_TIMEOUT_SECONDS;
        
        this.showState('active');
        this.startCountdown();
        this.startStatusCheck();
        this.scheduleAutoCancel();
        this.fetchBalance();
    }
    
    formatPhoneNumber(number) {
        // Remove non-digits
        const digits = number.replace(/\D/g, '');
        
        // Format Brazilian number
        if (digits.length === 13 && digits.startsWith('55')) {
            const ddd = digits.slice(2, 4);
            const part1 = digits.slice(4, 9);
            const part2 = digits.slice(9);
            return `+55 ${ddd} ${part1}-${part2}`;
        }
        
        return `+${digits}`;
    }
    
    startCountdown() {
        this.updateCountdown();
        
        this.countdownInterval = setInterval(() => {
            this.updateCountdown();
        }, 1000);
    }
    
    updateCountdown() {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const remaining = Math.max(0, this.totalSeconds - elapsed);
        
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        this.countdownText.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update progress ring
        const progress = remaining / this.totalSeconds;
        const circumference = 283; // 2 * PI * 45
        const offset = circumference * (1 - progress);
        this.countdownProgress.style.strokeDashoffset = offset;
        
        // Color changes based on time remaining
        this.countdownProgress.classList.remove('warning', 'danger');
        if (remaining < 120) {
            this.countdownProgress.classList.add('danger');
        } else if (remaining < 300) {
            this.countdownProgress.classList.add('warning');
        }
        
        // Timeout reached
        if (remaining <= 0) {
            this.cancelActivation('timeout');
        }
    }
    
    startStatusCheck() {
        // Check every 3 seconds
        this.statusCheckInterval = setInterval(async () => {
            await this.checkStatus();
        }, 3000);
    }
    
    async checkStatus() {
        if (!this.currentActivation) return;
        
        try {
            const result = await this.apiCall('getStatusV2', {
                id: this.currentActivation.activationId
            });
            
            // Check if SMS received
            if (result.sms && result.sms.code && result.sms.code !== 'code' && result.sms.code !== '') {
                this.handleSmsReceived(result.sms);
            } else if (result === 'STATUS_CANCEL') {
                this.handleCancelled('Cancelado pelo servidor');
            } else if (typeof result === 'string' && result.startsWith('STATUS_OK:')) {
                const code = result.split(':')[1];
                this.handleSmsReceived({ code, text: '' });
            }
        } catch (error) {
            console.error('Erro ao verificar status:', error);
        }
    }
    
    handleSmsReceived(sms) {
        this.stopTimers();
        
        this.smsCodeEl.textContent = sms.code;
        this.smsTextEl.textContent = sms.text || '';
        
        this.showState('sms');
        this.showToast('SMS recebido!');
    }
    
    scheduleAutoCancel() {
        if (!this.autoCancelEnabled) return;
        
        // Schedule auto-cancel before timeout to save money
        const autoCancelTime = (this.totalSeconds - this.cancelMargin) * 1000;
        
        this.autoCancelTimeout = setTimeout(() => {
            // Only auto-cancel if SMS hasn't arrived
            if (this.currentActivation && !this.smsState.classList.contains('hidden') === false) {
                const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
                if (elapsed >= MIN_CANCEL_TIME) {
                    this.cancelActivation('auto');
                }
            }
        }, autoCancelTime);
    }
    
    async cancelActivation(reason = 'manual') {
        if (!this.currentActivation) return;
        
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        
        // Check if we can cancel (min 2 minutes)
        if (elapsed < MIN_CANCEL_TIME && reason !== 'timeout') {
            const remaining = MIN_CANCEL_TIME - elapsed;
            this.showToast(`Aguarde ${remaining}s para cancelar`);
            return;
        }
        
        this.stopTimers();
        this.statusText.textContent = 'Cancelando...';
        
        try {
            const result = await this.apiCall('setStatus', {
                id: this.currentActivation.activationId,
                status: 8 // Cancel
            });
            
            if (result === 'ACCESS_CANCEL' || result === 'ACCESS_READY') {
                let reasonText = '';
                switch (reason) {
                    case 'auto':
                        reasonText = 'Cancelado automaticamente para evitar cobrança';
                        break;
                    case 'timeout':
                        reasonText = 'Tempo expirado';
                        break;
                    case 'manual':
                        reasonText = 'Cancelado por você';
                        break;
                    default:
                        reasonText = 'Número cancelado';
                }
                this.handleCancelled(reasonText);
            } else if (result === 'EARLY_CANCEL_DENIED') {
                this.showToast('Aguarde mais tempo para cancelar');
                this.showState('active');
                this.startCountdown();
                this.startStatusCheck();
            } else {
                this.handleCancelled('Cancelado');
            }
        } catch (error) {
            this.handleCancelled('Erro ao cancelar');
        }
        
        this.fetchBalance();
    }
    
    handleCancelled(reason) {
        this.stopTimers();
        this.cancelledReason.textContent = reason;
        this.currentActivation = null;
        this.showState('cancelled');
    }
    
    async confirmActivation() {
        if (!this.currentActivation) {
            this.resetToIdle();
            return;
        }
        
        try {
            await this.apiCall('setStatus', {
                id: this.currentActivation.activationId,
                status: 6 // Complete
            });
        } catch (error) {
            console.error('Erro ao confirmar:', error);
        }
        
        this.currentActivation = null;
        this.fetchBalance();
        this.resetToIdle();
        this.showToast('Ativação confirmada!');
    }
    
    handleError(error) {
        this.stopTimers();
        
        const errorMessages = {
            'NO_NUMBERS': 'Sem números disponíveis no momento',
            'NO_BALANCE': 'Saldo insuficiente',
            'BAD_KEY': 'API Key inválida',
            'BAD_SERVICE': 'Serviço não disponível',
            'BANNED': 'Conta bloqueada',
            'ERROR_SQL': 'Erro no servidor',
            'NO_ACTIVATION': 'Ativação não encontrada'
        };
        
        this.errorText.textContent = errorMessages[error] || error || 'Erro desconhecido';
        this.showState('error');
    }
    
    resetToIdle() {
        this.stopTimers();
        this.currentActivation = null;
        this.showState('idle');
        this.fetchBalance();
    }
    
    stopTimers() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
        }
        if (this.autoCancelTimeout) {
            clearTimeout(this.autoCancelTimeout);
            this.autoCancelTimeout = null;
        }
    }
    
    // Config Methods
    saveConfig() {
        const key = this.apiKeyInput.value.trim();
        
        if (!key) {
            this.showToast('Digite a API Key');
            return;
        }
        
        this.apiKey = key;
        localStorage.setItem('apiKey', key);
        
        this.showDashboard();
        this.fetchBalance();
    }
    
    openSettings() {
        this.settingsApiKey.value = this.apiKey;
        this.autoCancelToggle.checked = this.autoCancelEnabled;
        this.cancelMarginInput.value = this.cancelMargin;
        this.settingsModal.classList.remove('hidden');
    }
    
    saveSettings() {
        const key = this.settingsApiKey.value.trim();
        
        if (key) {
            this.apiKey = key;
            localStorage.setItem('apiKey', key);
        }
        
        this.autoCancelEnabled = this.autoCancelToggle.checked;
        localStorage.setItem('autoCancel', this.autoCancelEnabled);
        
        this.cancelMargin = parseInt(this.cancelMarginInput.value) || 60;
        localStorage.setItem('cancelMargin', this.cancelMargin);
        
        this.closeSettings();
        this.fetchBalance();
        this.showToast('Configurações salvas');
    }
    
    closeSettings() {
        this.settingsModal.classList.add('hidden');
    }
    
    // Utility Methods
    copyPhoneNumber() {
        const number = this.currentActivation?.phoneNumber || '';
        this.copyToClipboard(number.replace(/\D/g, ''));
        this.showToast('Número copiado!');
    }
    
    copyCode() {
        const code = this.smsCodeEl.textContent;
        this.copyToClipboard(code);
        this.showToast('Código copiado!');
    }
    
    copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
    }
    
    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.remove('hidden');
        
        setTimeout(() => {
            this.toast.classList.add('hidden');
        }, 2500);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new TrustSMS();
});
