export class AdminEventResponse<T = {}> {
    public event: string = "";
    public data?: T | undefined = undefined;
    public requestComplete: boolean = true;
    public requestError: string | undefined = undefined;
}
