import { atom } from "jotai";

import { CommandLinePage } from "../enums/CommandLinePage";
import { CreateInstanceModel } from "../models/CreateInstanceModel";
import { CommandLineModule } from "../enums/CommandLineModule";
import { Breadcrumb } from "../models/Breadcrumb";

const breadcrumbsAtom = atom<Breadcrumb[]>([{ module: CommandLineModule.None, page: CommandLinePage.None }]);

export const CliColors = {
    darkOrange: "#D97706",
    darkYellow: "#FBBF24",
};

export const createInstanceModelAtom = atom<CreateInstanceModel>(new CreateInstanceModel());

export const currentModuleAtom = atom<CommandLineModule>(
    (get) => get(breadcrumbsAtom)[get(breadcrumbsAtom).length - 1].module
);

export const currentPageAtom = atom<CommandLinePage>(
    (get) => get(breadcrumbsAtom)[get(breadcrumbsAtom).length - 1].page
);

export const goBackOnePageAtom = atom(null, (get, set) => {
    if (get(breadcrumbsAtom).length > 2) {
        set(breadcrumbsAtom, get(breadcrumbsAtom).splice(0, get(breadcrumbsAtom).length - 1));
    }
});

export const moveToNewPageAtom = atom(null, (get, set, newPage: Breadcrumb) =>
    set(breadcrumbsAtom, [...get(breadcrumbsAtom), newPage])
);
