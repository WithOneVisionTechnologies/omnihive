import React from "react";
import { Box, Text } from "ink";
import SelectInput, { SelectInputItem } from "../components/select-input/SelectInput";
import { CommandLinePage } from "../enums/CommandLinePage";
import { CliColors, moveToNewPageAtom, goBackOnePageAtom, baseMenuItemsAtom } from "../stores/CommandLineStore";
import { useAtom } from "jotai";

const MainMenu: React.FC = (): React.ReactElement => {
    const [baseMenuItems] = useAtom(baseMenuItemsAtom);
    const [, goBackOnePage] = useAtom(goBackOnePageAtom);
    const [, moveToNewPage] = useAtom(moveToNewPageAtom);

    const menuItems: SelectInputItem<string>[] = [
        {
            label: "Create New Instance",
            value: "create",
        },
        {
            label: "Edit Existing Instance",
            value: "edit",
        },
        ...baseMenuItems,
    ];

    const onSelectHandler = (item: SelectInputItem<any>) => {
        switch (item.value) {
            case "create":
                moveToNewPage(CommandLinePage.CreateInstance_DataSource);
                break;
            case "edit":
                moveToNewPage(CommandLinePage.EditInstance);
                break;
            case "go-back":
                goBackOnePage();
                break;
        }
    };

    return (
        <Box marginTop={1} flexDirection="column">
            <Box marginBottom={1}>
                <Text color={CliColors.darkYellow} underline={true}>
                    Select Option
                </Text>
            </Box>
            <SelectInput items={menuItems} focusColor={CliColors.darkYellow} onSelect={onSelectHandler} />
        </Box>
    );
};

export default MainMenu;
