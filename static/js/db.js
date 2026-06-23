// db.js — data layer now backed by Flask/SQLite API
// Provides async wrappers around the backend REST endpoints

const DB = {
    async getPatients() {
        const res = await fetch('/api/patients');
        return res.ok ? res.json() : [];
    },
    async getDiagnoses() {
        const res = await fetch('/api/diagnoses');
        return res.ok ? res.json() : [];
    },
    async getUsers() {
        const res = await fetch('/api/users');
        return res.ok ? res.json() : [];
    },
    async getStats() {
        const res = await fetch('/api/stats');
        return res.ok ? res.json() : {};
    },
    async getSessionUser() {
        const res = await fetch('/api/session-user');
        return res.ok ? res.json() : null;
    },
    async deleteUser(userId) {
        const res = await fetch(`/api/users/delete/${userId}`, { method: 'POST' });
        return res.ok ? res.json() : { success: false };
    },
    async updateProfile(name, phone) {
        const res = await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone })
        });
        return res.ok ? res.json() : { success: false };
    },
    async getLogs() {
        const res = await fetch('/api/logs');
        return res.ok ? res.json() : [];
    }
};
