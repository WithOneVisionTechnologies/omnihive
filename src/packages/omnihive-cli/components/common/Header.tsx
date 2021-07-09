import React from "react";
import { Box, Text } from "ink";
import figlet from "figlet";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";
import { CliColors, currentModuleAtom } from "../../stores/CommandLineStore";
import { useAtom } from "jotai";
import { CommandLineModule } from "../../enums/CommandLineModule";

const Header: React.FC = (): React.ReactElement => {
    const [currentModule] = useAtom(currentModuleAtom);

    const asciiBee = (): string => {
        const beeAscii: StringBuilder = new StringBuilder();

        beeAscii.appendLine("  ,,   ");
        beeAscii.appendLine(" _oo_  ");
        beeAscii.appendLine(" /==\\ ");
        beeAscii.appendLine("(/==\\)");
        beeAscii.appendLine("  \\/  ");

        return beeAscii.outputString();
    };

    const underline: string = "----------------------------------------------------------";

    return (
        <Box flexDirection="column" alignItems="flex-start">
            <Box flexDirection="row">
                <Box>
                    <Text color={CliColors.darkYellow} bold={true}>
                        {figlet.textSync("OMNIHIVE")}
                    </Text>
                </Box>
                <Box marginLeft={2}>
                    <Text color={CliColors.mediumYellow}>{asciiBee()}</Text>
                </Box>
            </Box>
            {currentModule !== CommandLineModule.None && (
                <Box flexDirection="column" alignItems="center">
                    <Text color={CliColors.darkYellow}>{underline}</Text>
                    <Text>{currentModule}</Text>
                    <Text color={CliColors.darkYellow}>{underline}</Text>
                </Box>
            )}
        </Box>
    );
};

export default Header;
