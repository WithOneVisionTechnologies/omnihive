import { atom } from "jotai";
import clear from "clear";
import { CommandLinePage } from "../enums/CommandLinePage";
import { SelectInputItem } from "../components/select-input/SelectInput";
import { CreateInstanceParameters } from "../models/CreateInstanceParameters";

export const CliColors = {
    darkOrange: "#D97706",
    darkYellow: "#FBBF24",
};

export const clearConsole = () => {
    clear();
};

export const baseMenuItemsAtom = atom<SelectInputItem<string>[]>((get) => {
    if (get(breadcrumbsAtom).length === 1) {
        return [];
    }

    return [
        {
            label: "Go Back",
            value: "go-back",
        },
    ];
});

export const breadcrumbsAtom = atom<CommandLinePage[]>([CommandLinePage.MainMenu]);
export const createInstanceParametersAtom = atom<CreateInstanceParameters>(new CreateInstanceParameters());
export const currentPageAtom = atom<CommandLinePage>((get) => get(breadcrumbsAtom)[get(breadcrumbsAtom).length - 1]);
export const goBackOnePageAtom = atom(null, (get, set) =>
    set(breadcrumbsAtom, get(breadcrumbsAtom).splice(0, get(breadcrumbsAtom).length - 1))
);
export const initializedAtom = atom<boolean>(false);
export const moveToNewPageAtom = atom(null, (get, set, newPage: CommandLinePage) =>
    set(breadcrumbsAtom, [...get(breadcrumbsAtom), newPage])
);
