export class AdminResponse<T = {}> {
    public data?: T | undefined;
    public requestComplete?: boolean;
    public requestError?: string | undefined;

    constructor() {
        this.requestComplete = true;
        this.requestError = undefined;
        this.data = undefined;
    }
}
