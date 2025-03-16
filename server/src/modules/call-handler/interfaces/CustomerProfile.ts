export interface CustomerProfile {
    id?: string;
    userAgent?: string;
    ipAddress?: string;
    preferredLanguage?: string;
    technicalLevel?: 'beginner' | 'intermediate' | 'advanced';
    previousInteractions?: number;
}