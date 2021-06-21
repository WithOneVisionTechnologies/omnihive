import React from "react";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import TextInput from "../ink/text-input/TextInput";
import { Text, Box } from "ink";
import { CliColors, currentModuleAtom } from "../../stores/CommandLineStore";
import { useAtom } from "jotai";

interface TextBoxProps {
    selectedText?: string;
    onTextChange: (returnText: string) => void;
    title: string;
}

const TextBox: React.FC<TextBoxProps> = (props): React.ReactElement => {
    const [currentModule] = useAtom(currentModuleAtom);
    const [textValue, setTextValue] = React.useState<string>("");

    React.useEffect(() => {
        if (!IsHelper.isNullOrUndefinedOrEmptyStringOrWhitespace(props.selectedText)) {
            setTextValue(props.selectedText);
        }
    });

    const onChangeHandler = (newText: string) => {
        setTextValue(newText);
    };

    const onSubmitHandler = (newText: string) => {
        if (!IsHelper.isNullOrUndefinedOrEmptyStringOrWhitespace(newText)) {
            props.onTextChange(newText);
        }
    };

    return (
        <Box marginTop={1} flexDirection="column">
            <Box marginBottom={1}>
                <Text color={CliColors.darkYellow}>{currentModule.toUpperCase() + " >> "}</Text>
                <Text color={CliColors.lightYellow} underline={true}>
                    Where would you like your {props.title} to be located?
                </Text>
            </Box>
            <Box flexDirection={"row"}>
                <Box marginRight={1}>
                    <Text>File Location:</Text>
                </Box>
                <TextInput showCursor={true} value={textValue} onChange={onChangeHandler} onSubmit={onSubmitHandler} />
            </Box>
        </Box>
    );
};

export default TextBox;
