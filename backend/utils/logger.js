const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir);
        }
    }

    log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data
        };

        const logFile = path.join(
            this.logDir,
            `${level}-${new Date().toISOString().split('T')[0]}.log`
        );

        fs.appendFileSync(
            logFile,
            JSON.stringify(logEntry) + '\n'
        );

        // Console output
        console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data);
    }

    info(message, data) {
        this.log('info', message, data);
    }

    error(message, data) {
        this.log('error', message, data);
    }

    payment(message, data) {
        this.log('payment', message, data);
    }
}

module.exports = new Logger();