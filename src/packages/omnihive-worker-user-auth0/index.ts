import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import { IUserWorker } from "@withonevision/omnihive-core/interfaces/IUserWorker";
import { AuthUser } from "@withonevision/omnihive-core/models/AuthUser";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";

import {
    AppMetadata,
    AuthenticationClient,
    CreateUserData,
    ManagementClient,
    PasswordGrantOptions,
    ResetPasswordEmailOptions,
    UpdateUserData,
    User,
    UserMetadata,
} from "auth0";
import { serializeError } from "serialize-error";

export class AuthZeroUserWorkerMetadata {
    public clientId: string = "";
    public clientSecret: string = "";
    public domain: string = "";
    public connection: string = "";
}

export default class AuthZeroUserWorker extends HiveWorkerBase implements IUserWorker {
    private typedMetadata!: AuthZeroUserWorkerMetadata;
    private authClient!: AuthenticationClient;
    private managementClient!: ManagementClient;

    constructor() {
        super();
    }

    public async init(name: string, metadata?: any): Promise<void> {
        try {
            await AwaitHelper.execute(super.init(name, metadata));

            this.typedMetadata = this.checkObjectStructure<AuthZeroUserWorkerMetadata>(
                AuthZeroUserWorkerMetadata,
                metadata
            );

            this.authClient = new AuthenticationClient({
                domain: this.typedMetadata.domain,
                clientId: this.typedMetadata.clientId,
                clientSecret: this.typedMetadata.clientSecret,
            });

            this.managementClient = new ManagementClient({
                domain: this.typedMetadata.domain,
                clientId: this.typedMetadata.clientId,
                clientSecret: this.typedMetadata.clientSecret,
                scope: "read:users update:users delete:users",
            });
        } catch (err) {
            throw new Error("User Init Error => " + JSON.stringify(serializeError(err)));
        }
    }

    public create = async (email: string, password: string): Promise<AuthUser> => {
        if (IsHelper.isEmptyStringOrWhitespace(email) || IsHelper.isEmptyStringOrWhitespace(password)) {
            throw new Error("All parameters must be valid strings");
        }

        const logWorker: ILogWorker | undefined = this.getWorker<ILogWorker | undefined>(HiveWorkerType.Log);

        try {
            const authUser: AuthUser = new AuthUser();
            const createUserData: CreateUserData = { connection: this.typedMetadata.connection, email, password };

            await AwaitHelper.execute(this.managementClient.createUser(createUserData));
            authUser.email = email;

            return authUser;
        } catch (err) {
            const error = `Create User Error => ${JSON.stringify(serializeError(err))}`;
            logWorker?.write(OmniHiveLogLevel.Error, error);
            throw new Error(error);
        }
    };

    public get = async (email: string): Promise<AuthUser> => {
        if (IsHelper.isEmptyStringOrWhitespace(email)) {
            throw new Error("Must have an email to search by");
        }

        const logWorker: ILogWorker | undefined = this.getWorker<ILogWorker | undefined>(HiveWorkerType.Log);

        let fullUser: User<AppMetadata, UserMetadata> | undefined = undefined;
        let user: User | undefined = undefined;

        try {
            const users: User<AppMetadata, UserMetadata>[] = await AwaitHelper.execute(
                this.managementClient.getUsersByEmail(email)
            );

            if (IsHelper.isEmptyArray(users)) {
                throw new Error("User cannot be found");
            }

            user = users[0];

            if (IsHelper.isNullOrUndefined(user) || IsHelper.isNullOrUndefined(user.user_id)) {
                throw new Error("User cannot be found");
            }

            fullUser = await AwaitHelper.execute(this.managementClient.getUser({ id: user.user_id }));

            if (IsHelper.isNullOrUndefined(fullUser)) {
                throw new Error("Full user cannot be found");
            }

            const authUser: AuthUser = new AuthUser();
            authUser.email = email;

            if (!IsHelper.isNullOrUndefined(fullUser.given_name)) {
                authUser.firstName = fullUser.given_name;
            }

            if (!IsHelper.isNullOrUndefined(fullUser.family_name)) {
                authUser.lastName = fullUser.family_name;
            }

            if (!IsHelper.isNullOrUndefined(fullUser.phone_number)) {
                authUser.phoneNumber = fullUser.phone_number;
            }

            if (
                (!IsHelper.isNullOrUndefined(fullUser.email) &&
                    !IsHelper.isNullOrUndefined(fullUser.nickname) &&
                    fullUser.email.includes(fullUser.nickname)) ||
                IsHelper.isNullOrUndefined(user) ||
                IsHelper.isNullOrUndefined(user.nickname)
            ) {
                authUser.nickname = "";
            } else {
                authUser.nickname = user.nickname;
            }

            if (
                (!IsHelper.isEmptyStringOrWhitespace(authUser.firstName) ||
                    !IsHelper.isEmptyStringOrWhitespace(authUser.nickname)) &&
                !IsHelper.isEmptyStringOrWhitespace(authUser.lastName)
            ) {
                if (!IsHelper.isEmptyStringOrWhitespace(authUser.nickname)) {
                    authUser.fullName = fullUser.nickname + " " + fullUser.family_name;
                } else {
                    authUser.fullName = fullUser.given_name + " " + fullUser.family_name;
                }
            }

            if (
                !IsHelper.isNullOrUndefined(fullUser.user_metadata) &&
                !IsHelper.isNullOrUndefined(fullUser.user_metadata.address) &&
                !IsHelper.isNullOrUndefined(user?.user_metadata) &&
                !IsHelper.isNullOrUndefined(user.user_metadata.address) &&
                !IsHelper.isEmptyStringOrWhitespace(user.user_metadata.address)
            ) {
                authUser.address = fullUser.user_metadata.address;
            }

            return authUser;
        } catch (err) {
            const error = `Get User Error => ${JSON.stringify(serializeError(err))}`;
            logWorker?.write(OmniHiveLogLevel.Error, error);
            throw new Error(error);
        }
    };

    public login = async (email: string, password: string): Promise<AuthUser> => {
        if (IsHelper.isEmptyStringOrWhitespace(email) || IsHelper.isEmptyStringOrWhitespace(password)) {
            throw new Error("All parameters must be valid strings");
        }

        const logWorker: ILogWorker | undefined = this.getWorker<ILogWorker | undefined>(HiveWorkerType.Log);

        try {
            const databaseLoginData: PasswordGrantOptions = {
                realm: this.typedMetadata.connection,
                username: email,
                password,
            };
            await AwaitHelper.execute(this.authClient.passwordGrant(databaseLoginData));
        } catch (err) {
            const error = `Login Error => ${JSON.stringify(serializeError(err))}`;
            logWorker?.write(OmniHiveLogLevel.Error, error);
            throw new Error(error);
        }

        return this.get(email);
    };

    public passwordChangeRequest = async (email: string): Promise<boolean> => {
        if (IsHelper.isEmptyStringOrWhitespace(email)) {
            throw new Error("All parameters must be valid strings");
        }

        const logWorker: ILogWorker | undefined = this.getWorker<ILogWorker | undefined>(HiveWorkerType.Log);

        const changePasswordData: ResetPasswordEmailOptions = { email, connection: this.typedMetadata.connection };

        try {
            await AwaitHelper.execute(this.authClient.requestChangePasswordEmail(changePasswordData));
        } catch (err) {
            const error = `Change Password Error => ${JSON.stringify(serializeError(err))}`;
            logWorker?.write(OmniHiveLogLevel.Error, error);
            throw new Error(error);
        }

        return true;
    };

    public update = async (userName: string, authUser: AuthUser): Promise<AuthUser> => {
        if (IsHelper.isEmptyStringOrWhitespace(userName) || !authUser) {
            throw new Error("Must have a username and some valid properties to update.");
        }

        const logWorker: ILogWorker | undefined = this.getWorker<ILogWorker | undefined>(HiveWorkerType.Log);

        let user: User | undefined = undefined;

        try {
            const users = await AwaitHelper.execute(this.managementClient.getUsersByEmail(userName));
            user = users[0];

            if (IsHelper.isNullOrUndefined(user) || IsHelper.isNullOrUndefined(user.user_id)) {
                throw new Error("User cannot be found");
            }

            const userData: UpdateUserData = {};

            if (!IsHelper.isEmptyStringOrWhitespace(authUser.email) && userName !== authUser.email) {
                userData.email = authUser.email;
            } else {
                userData.email = userName;
                authUser.email = userName;
            }

            if (!IsHelper.isEmptyStringOrWhitespace(authUser.firstName)) {
                userData.given_name = authUser.firstName;
            }

            if (!IsHelper.isEmptyStringOrWhitespace(authUser.lastName)) {
                userData.family_name = authUser.lastName;
            }

            if (
                !IsHelper.isNullOrUndefined(user.email) &&
                !IsHelper.isNullOrUndefined(user.nickname) &&
                user.email.includes(user.nickname) &&
                !IsHelper.isEmptyStringOrWhitespace(authUser.firstName)
            ) {
                userData.nickname = authUser.firstName;
            }

            if (
                (!IsHelper.isEmptyStringOrWhitespace(authUser.firstName) ||
                    !IsHelper.isEmptyStringOrWhitespace(authUser.nickname)) &&
                !IsHelper.isEmptyStringOrWhitespace(authUser.lastName)
            ) {
                if (!IsHelper.isEmptyStringOrWhitespace(authUser.nickname)) {
                    userData.name = authUser.nickname + " " + authUser.lastName;
                } else {
                    userData.name = authUser.firstName + " " + authUser.lastName;
                }
            }

            if (!IsHelper.isEmptyStringOrWhitespace(authUser.nickname)) {
                userData.nickname = authUser.nickname;
            }

            if (!IsHelper.isEmptyStringOrWhitespace(authUser.phoneNumber)) {
                userData.phone_number = authUser.phoneNumber;
            }

            await AwaitHelper.execute(this.managementClient.updateUser({ id: user.user_id }, userData));

            const userMetaData: any = {};

            if (IsHelper.isEmptyStringOrWhitespace(authUser.address)) {
                userMetaData.address = authUser.address;
            }

            await AwaitHelper.execute(this.managementClient.updateUserMetadata({ id: user.user_id }, userMetaData));
        } catch (err) {
            const error = `Update User Error => ${JSON.stringify(serializeError(err))}`;
            logWorker?.write(OmniHiveLogLevel.Error, error);
            throw new Error(error);
        }

        return this.get(authUser.email);
    };

    public delete = async (id: string): Promise<string> => {
        if (IsHelper.isEmptyStringOrWhitespace(id)) {
            throw new Error("All parameters must be valid strings");
        }

        const logWorker: ILogWorker | undefined = this.getWorker<ILogWorker | undefined>(HiveWorkerType.Log);

        try {
            const deleteUserData: any = { id };

            await AwaitHelper.execute(this.managementClient.deleteUser(deleteUserData));

            return "User successfully deleted";
        } catch (err) {
            const error = `Delete User Error => ${JSON.stringify(serializeError(err))}`;
            logWorker?.write(OmniHiveLogLevel.Error, error);
            throw new Error(error);
        }
    };

    public getUserIdByEmail = async (email: string): Promise<string | undefined> => {
        if (IsHelper.isEmptyStringOrWhitespace(email)) {
            throw new Error("Must provide an email to search.");
        }

        const logWorker: ILogWorker | undefined = this.getWorker<ILogWorker | undefined>(HiveWorkerType.Log);

        let user: User | undefined = undefined;

        try {
            const users = await AwaitHelper.execute(this.managementClient.getUsersByEmail(email));
            user = users[0];

            if (IsHelper.isNullOrUndefined(user) || IsHelper.isNullOrUndefined(user.user_id)) {
                return undefined;
            } else {
                return user.user_id;
            }
        } catch (err) {
            const error = `Get UserId By Email Error => ${JSON.stringify(serializeError(err))}`;
            logWorker?.write(OmniHiveLogLevel.Error, error);
            throw new Error(error);
        }
    };
}
