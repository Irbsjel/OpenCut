"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { loadFullFont } from "@/fonts/google-fonts";
import {
	MODERN_FONTS_2026,
	MODERN_FONT_CATEGORIES,
	ensureModernFontsStylesheet,
	notifyFontLoaded,
	type ModernFontCategory,
	type ModernFontDef,
} from "@/fonts/modern-fonts-2026";
import { cn } from "@/utils/ui";
import { Check, ChevronDown, Search, Sparkles } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { TextIcon } from "@hugeicons/core-free-icons";

interface FontPickerProps {
	defaultValue?: string;
	onValuePreview?: (value: string) => void;
	onValueChange?: (value: string) => void;
	className?: string;
}

export function FontPicker({
	defaultValue,
	onValuePreview,
	onValueChange,
	className,
}: FontPickerProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [activeCategory, setActiveCategory] =
		useState<ModernFontCategory>("all");
	const searchInputRef = useRef<HTMLInputElement>(null);
	const committedFontRef = useRef<string | undefined>(defaultValue);

	useEffect(() => {
		committedFontRef.current = defaultValue;
	}, [defaultValue]);

	useEffect(() => {
		ensureModernFontsStylesheet();
	}, []);

	const filteredFonts = useMemo(() => {
		return MODERN_FONTS_2026.filter((font) => {
			if (activeCategory !== "all" && font.category !== activeCategory) {
				return false;
			}
			if (!search.trim()) return true;
			const q = search.toLowerCase();
			return (
				font.family.toLowerCase().includes(q) ||
				font.badge.toLowerCase().includes(q) ||
				font.description.toLowerCase().includes(q)
			);
		});
	}, [activeCategory, search]);

	const handleSelect = useCallback(
		async (font: ModernFontDef) => {
			committedFontRef.current = font.family;
			onValuePreview?.(font.family);
			onValueChange?.(font.family);
			setOpen(false);
			try {
				await loadFullFont({ family: font.family, weights: font.weights });
				notifyFontLoaded();
			} catch {}
		},
		[onValueChange, onValuePreview],
	);

	const handleHover = useCallback(
		(font: ModernFontDef) => {
			onValuePreview?.(font.family);
			loadFullFont({ family: font.family, weights: font.weights })
				.then(() => notifyFontLoaded())
				.catch(() => {});
		},
		[onValuePreview],
	);

	const selectedFontMeta = useMemo(
		() => MODERN_FONTS_2026.find((f) => f.family === defaultValue),
		[defaultValue],
	);

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen) {
					setSearch("");
				}
			}}
		>
			<PopoverTrigger
				className={cn(
					"border-border bg-accent hover:bg-accent/80 flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 text-sm whitespace-nowrap transition-colors focus-visible:border-primary focus-visible:ring-0 focus:outline-hidden",
					className,
				)}
			>
				<div className="flex min-w-0 items-center gap-2">
					<span className="text-sky-400 [&_svg]:size-3.5 shrink-0">
						<HugeiconsIcon icon={TextIcon} />
					</span>
					<span
						className="truncate font-medium"
						style={{
							fontFamily: defaultValue
								? `"${defaultValue}", sans-serif`
								: undefined,
						}}
					>
						{defaultValue ?? "Montserrat"}
					</span>
					{selectedFontMeta && (
						<span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
							{selectedFontMeta.badge}
						</span>
					)}
				</div>
				<ChevronDown className="size-3.5 shrink-0 opacity-60" />
			</PopoverTrigger>
			<PopoverContent
				className="w-80 p-0 overflow-hidden border-white/10 bg-[#0d121d] shadow-2xl"
				align="start"
				side="left"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					searchInputRef.current?.focus();
				}}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				<div className="border-b border-white/10 bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-purple-500/10 px-3 py-2">
					<div className="flex items-center justify-between">
						<span className="flex items-center gap-1.5 text-xs font-semibold text-white">
							<Sparkles className="size-3.5 text-sky-400" />
							Catálogo Tipográfico 2026–2027
						</span>
						<span className="text-[10px] text-slate-400">
							{filteredFonts.length} fuentes Pro
						</span>
					</div>
					<div className="relative mt-1.5">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 shrink-0 text-slate-400" />
						<Input
							ref={searchInputRef}
							placeholder="Buscar fuente o estilo (ej. Viral, 2027, Serif)..."
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							size="xs"
							className="h-7 w-full pl-8 text-xs bg-black/40 border-white/10"
						/>
					</div>
				</div>

				<div className="flex gap-1 overflow-x-auto border-b border-white/10 px-2.5 py-1.5 no-scrollbar">
					{MODERN_FONT_CATEGORIES.map((cat) => (
						<button
							key={cat.key}
							type="button"
							onClick={() => setActiveCategory(cat.key)}
							className={cn(
								"shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
								activeCategory === cat.key
									? "bg-sky-500 text-slate-950 font-semibold"
									: "bg-white/5 text-slate-300 hover:bg-white/10",
							)}
						>
							{cat.label}
						</button>
					))}
				</div>

				<div className="max-h-80 overflow-y-auto divide-y divide-white/5">
					{filteredFonts.length === 0 ? (
						<div className="py-8 text-center text-xs text-slate-400">
							No se encontraron fuentes con ese filtro.
						</div>
					) : (
						filteredFonts.map((font) => {
							const isSelected = font.family === defaultValue;
							return (
								<button
									key={font.family}
									type="button"
									onClick={() => handleSelect(font)}
									onMouseEnter={() => handleHover(font)}
									className={cn(
										"flex w-full cursor-pointer flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-sky-500/10",
										isSelected && "bg-sky-500/15",
									)}
								>
									<div className="flex items-center justify-between gap-2">
										<span
											className="truncate text-base text-white"
											style={{
												fontFamily: `"${font.family}", sans-serif`,
												fontWeight: font.weights.includes(700) ? 700 : 400,
											}}
										>
											{font.family}
										</span>
										<div className="flex items-center gap-1.5 shrink-0">
											<span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
												{font.badge}
											</span>
											{isSelected && (
												<Check className="size-3.5 text-sky-400" />
											)}
										</div>
									</div>
									<div className="flex items-center justify-between gap-2">
										<span
											className="truncate text-xs text-slate-300/90"
											style={{
												fontFamily: `"${font.family}", sans-serif`,
											}}
										>
											{font.previewText}
										</span>
										<span className="truncate text-[10px] text-slate-400 max-w-[145px]">
											{font.description}
										</span>
									</div>
								</button>
							);
						})
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
