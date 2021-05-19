export class AdminEvent<T = {}> {
    public adminPassword: string = "";
    public event: string = "";
    public data?: T | undefined = undefined;
}
