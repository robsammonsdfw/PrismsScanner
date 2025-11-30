import React, { useState } from 'react';
import { Menu, X, LayoutGrid } from 'lucide-react';

export const Navbar: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);

    // Explicitly separate the links to ensure correct navigation flow
    const mainMenuLink = "https://main.embracehealth.ai";

    return (
        <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex items-center cursor-pointer" onClick={() => window.location.href = mainMenuLink}>
                        <span className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-cyan-500">
                            EmbraceHealth
                        </span>
                    </div>

                    {/* Desktop Menu */}
                    <div className="hidden md:flex items-center space-x-2 lg:space-x-4">
                        <a 
                            href={mainMenuLink}
                            className="px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:text-emerald-600 hover:bg-slate-50 transition-colors flex items-center space-x-2"
                        >
                            <LayoutGrid className="w-5 h-5" />
                            <span>Main Menu</span>
                        </a>
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="flex items-center md:hidden">
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className="p-2 rounded-md text-slate-500 hover:text-emerald-600 hover:bg-slate-100 focus:outline-none"
                            aria-expanded={isOpen}
                        >
                            <span className="sr-only">Open main menu</span>
                            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu Dropdown */}
            {isOpen && (
                <div className="md:hidden bg-white border-t border-slate-200 absolute w-full left-0 z-50 shadow-lg">
                    <div className="pt-2 pb-3 space-y-1">
                        <a 
                            href={mainMenuLink}
                            className="w-full text-left px-4 py-3 text-base font-medium border-l-4 border-transparent text-slate-600 hover:bg-slate-50 hover:text-emerald-600 flex items-center space-x-3"
                        >
                            <LayoutGrid className="w-5 h-5" />
                            <span>Main Menu</span>
                        </a>
                    </div>
                </div>
            )}
        </nav>
    );
};