import React from "react";
import { Box, Text } from "ink";
import figlet from "figlet";
import { StringBuilder } from "src/packages/omnihive-core/helpers/StringBuilder";
import { CliColors } from "../stores/CommandLineStore";

const Header: React.FC = (): React.ReactElement => {
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
        <Box flexDirection="column">
            <Box>
                <Text color={CliColors.darkOrange}>{underline}</Text>
            </Box>
            <Box flexDirection="row">
                <Box>
                    <Text color={CliColors.darkYellow} bold={true}>
                        {figlet.textSync("OMNIHIVE")}
                    </Text>
                </Box>
                <Box marginLeft={2}>
                    <Text color={CliColors.darkYellow}>{asciiBee()}</Text>
                </Box>
            </Box>
            <Box>
                <Text color={CliColors.darkOrange}>{underline}</Text>
            </Box>
        </Box>
    );
};

export default Header;
