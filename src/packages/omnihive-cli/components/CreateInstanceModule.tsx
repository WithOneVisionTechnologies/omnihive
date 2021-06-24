import React from "react";
import { useAtom } from "jotai";
import { createInstanceModelAtom, currentPageAtom, moveToNewPageAtom } from "../stores/CommandLineStore";
import { CommandLinePage } from "../enums/CommandLinePage";
import TextQuestion from "./common/TextQuestion";
import { IsHelper } from "src/packages/omnihive-core/helpers/IsHelper";
import { CommandLineModule } from "../enums/CommandLineModule";
import { Newline, Text } from "ink";

type CreateInstanceWizardStep = {
    page: CommandLinePage[];
    component: React.ReactElement;
    conditions?: () => boolean;
};

const CreateInstanceModule: React.FC = (): React.ReactElement => {
    const [currentError, setCurrentError] = React.useState<string>("");
    const [currentPage] = useAtom(currentPageAtom);
    const [createInstanceModel, setCreateInstanceModel] = useAtom(createInstanceModelAtom);
    const [, moveToNewPage] = useAtom(moveToNewPageAtom);

    const wizardLayout: CreateInstanceWizardStep[] = [
        {
            page: [CommandLinePage.CreateInstance_AdminPassword, CommandLinePage.CreateInstance_Root],
            component: (
                <TextQuestion
                    initialText={createInstanceModel.adminPassword}
                    question={"What would you like as your admin password?"}
                    textTitle={"Admin Password"}
                    onTextChange={(returnText: string) => {
                        if (returnText.length < 16) {
                            setCurrentError("Admin password must be at least 16 characters");
                            return;
                        }

                        if (/[A-Z]/.test(returnText) === false) {
                            setCurrentError("Admin password must contain at least one uppercase character");
                            return;
                        }

                        if (/[a-z]/.test(returnText) === false) {
                            setCurrentError("Admin password must contain at least one lowercase character");
                            return;
                        }

                        if (/\d/.test(returnText) === false) {
                            setCurrentError("Admin password must contain at least one number");
                            return;
                        }

                        setCreateInstanceModel({ ...createInstanceModel, adminPassword: returnText });
                        wizardStepper();
                    }}
                />
            ),
        },
        {
            page: [CommandLinePage.CreateInstance_AdminServerGroupId],
            component: (
                <TextQuestion
                    initialText={createInstanceModel.adminServerGroupId}
                    question={"What would you like as your server group ID?"}
                    textTitle={"Server Group ID"}
                    onTextChange={(returnText: string) => {
                        setCreateInstanceModel({ ...createInstanceModel, adminPassword: returnText });
                        wizardStepper();
                    }}
                />
            ),
        },
        {
            page: [CommandLinePage.CreateInstance_AdminSocketPort],
            component: (
                <TextQuestion
                    initialText={createInstanceModel.adminSocketPort.toString()}
                    question={"What port would you like to host the admin socket server?"}
                    textTitle={"Admin Socket Port"}
                    onTextChange={(returnText: string) => {
                        setCreateInstanceModel({ ...createInstanceModel, adminSocketPort: +returnText });
                        wizardStepper();
                    }}
                />
            ),
        },
    ];

    const wizardStepper = () => {
        if (
            wizardLayout.findIndex((wp: CreateInstanceWizardStep) => wp.page.includes(currentPage)) ===
            wizardLayout.length - 1
        ) {
            return;
        }

        let continueSearch: boolean = true;
        let nextStepIndex: number =
            wizardLayout.findIndex((wp: CreateInstanceWizardStep) => wp.page.includes(currentPage)) + 1;

        do {
            const nextStep: CreateInstanceWizardStep = wizardLayout[nextStepIndex];

            if (IsHelper.isNullOrUndefined(nextStep.conditions)) {
                continueSearch = false;
            }

            if (
                continueSearch === true &&
                !IsHelper.isNullOrUndefined(nextStep.conditions) &&
                nextStep.conditions() === true
            ) {
                continueSearch = false;
            }

            if (nextStepIndex > wizardLayout.length - 1) {
                continueSearch = false;
            }

            if (continueSearch) {
                nextStepIndex++;
            }
        } while (continueSearch);

        moveToNewPage({ module: CommandLineModule.CreateInstance, page: wizardLayout[nextStepIndex].page[0] });
    };

    return (
        <>
            {
                wizardLayout[wizardLayout.findIndex((wp: CreateInstanceWizardStep) => wp.page.includes(currentPage))]
                    .component
            }
            {!IsHelper.isNullOrUndefinedOrEmptyStringOrWhitespace(currentError) && (
                <>
                    <Newline />
                    <Text>{currentError}</Text>
                </>
            )}
        </>
    );
};

export default CreateInstanceModule;
