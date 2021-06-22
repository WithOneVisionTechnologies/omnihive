import { CommandLineModule } from "../enums/CommandLineModule";
import { CommandLinePage } from "../enums/CommandLinePage";

export class Breadcrumb {
    public module: CommandLineModule = CommandLineModule.MainMenu;
    public page: CommandLinePage = CommandLinePage.MainMenu_Root;
}
