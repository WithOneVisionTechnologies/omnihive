export class AdminRequest<T = {}> {
    public adminPassword: string = "";
    public data?: T | undefined = undefined;
}
