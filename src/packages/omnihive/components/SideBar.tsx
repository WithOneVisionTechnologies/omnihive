// import React from "react";
// import { SideBarGroup } from "./SideBarGroup";

// export const SideBar: React.FC = (): React.ReactElement => {
//     const divider = (
//         <div className="flex bg-gray-900 content-center justify-center w-full">
//             <div className="m-2 bg-gray-100  h-px w-9/12"></div>
//         </div>
//     );

//     return (
//         <>
//             <div className="flex flex-col w-64">
//                 <div className="flex flex-col h-0 flex-1">
//                     <div className="flex items-center h-16 flex-shrink-0 px-4 bg-gray-900 text-white text-2xl">
//                         <img className="h-10 w-auto mr-4" src="/images/omnihive-bee-light.png" alt="OmniHive" />
//                         OmniHive
//                     </div>
//                     {divider}
//                     <SideBarGroup
//                         heading="Browsers"
//                         items={[
//                             { label: "browser 1", slug: "browser1", externalLink: true },
//                             { label: "browser 2", slug: "browser2", externalLink: true },
//                         ]}
//                     />
//                 </div>
//             </div>
//         </>
//     );
// };

const navigation = [
    {
        name: "Browsers",
        href: "#",
        items: [
            { label: "browser 1", slug: "browser1", externalLink: true },
            { label: "browser 2", slug: "browser2", externalLink: true },
        ],
        current: true,
    },
    { name: "Configuration", href: "#", icon: "", current: false },
    { name: "Tools", href: "#", icon: "", current: false },
];

function classNames(...classes: any[]): string {
    return classes.filter(Boolean).join(" ");
}

export const SideBar: React.FC = (): React.ReactElement => {
    return (
        <div className="hidden md:flex md:flex-shrink-0">
            <div className="flex flex-col w-64">
                {/* Sidebar component, swap this element with another sidebar if you like */}
                <div className="flex flex-col h-0 flex-1">
                    <div className="flex items-center h-16 py-2 flex-shrink-0 px-4 bg-gray-800 text-white text-2xl">
                        <img className="h-10 w-auto mr-4" src="/images/omnihive-bee-light.png" alt="OmniHive" />
                        OmniHive
                    </div>
                    <div className="flex-1 flex flex-col overflow-y-auto">
                        <nav className="flex-1 px-2 py-4 bg-gray-750 space-y-1">
                            {navigation.map((item) => (
                                <a
                                    key={item.name}
                                    href={item.href}
                                    className={classNames(
                                        item.current
                                            ? "bg-gray-900 text-white"
                                            : "text-gray-300 hover:bg-gray-700 hover:text-white",
                                        "group flex items-center px-2 py-2 text-sm font-medium rounded-md"
                                    )}
                                >
                                    <img
                                        className={classNames(
                                            item.current ? "text-gray-300" : "text-gray-400 group-hover:text-gray-300",
                                            "mr-3 flex-shrink-0 h-6 w-6"
                                        )}
                                        aria-hidden="true"
                                        src={item.icon}
                                    />
                                    {item.name}
                                </a>
                            ))}
                        </nav>
                    </div>
                </div>
            </div>
        </div>
    );
};
