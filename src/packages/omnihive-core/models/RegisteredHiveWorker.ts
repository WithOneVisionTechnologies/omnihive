import { RegisteredHiveWorkerSection } from "../enums/RegisteredHiveWorkerSection";
import { HiveWorker } from "./HiveWorker";

export class RegisteredHiveWorker extends HiveWorker {
    public instance: any;
    public section: RegisteredHiveWorkerSection = RegisteredHiveWorkerSection.User;
}
