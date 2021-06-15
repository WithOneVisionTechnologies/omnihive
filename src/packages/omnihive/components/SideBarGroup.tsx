import { useState } from "react";

type SideBarGroupProps = {
    heading: string;
    items: { label: string; slug: string; externalLink: boolean }[];
};

export const SideBarGroup: React.FC<SideBarGroupProps> = (props): React.ReactElement => {
    const [expanded, setExpanded] = useState(false);

    return (
        <>
            <div>
                <a
                    href="#"
                    className="bg-gray-900 text-white group flex items-center px-2 py-2 text-md font-medium rounded-md"
                    onClick={() => setExpanded(!expanded)}
                >
                    <svg
                        className="text-gray-300 mx-3 flex-shrink-0 h-4 w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 16 16"
                        stroke="currentColor"
                        aria-hidden="true"
                    >
                        {expanded ? (
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                fillRule="evenodd"
                                d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"
                            />
                        ) : (
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                fillRule="evenodd"
                                d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"
                            />
                        )}
                    </svg>
                    {props.heading}
                </a>
                {expanded && (
                    <div>
                        {props.items.map((item) => (
                            <div key={item.slug}>{item.label}</div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
};
