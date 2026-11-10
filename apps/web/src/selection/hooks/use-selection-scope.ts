import { useEffect, useState } from "react";
import { useCommittedRef } from "@/hooks/use-committed-ref";
import { useSelectionContext } from "@/selection/context";
import { activateScope, type ScopeEntry } from "@/selection/scope";

export function useSelectionScope({
	onDelete,
	onActivate,
}: {
	onDelete?: (selectedIds: string[]) => void;
	onActivate?: () => void;
} = {}) {
	const { selectedIds, clearSelection } = useSelectionContext();
	const hasSelection = selectedIds.length > 0;
	const hasSelectionRef = useCommittedRef(hasSelection);
	const selectedIdsRef = useCommittedRef(selectedIds);
	const clearSelectionRef = useCommittedRef(clearSelection);
	const onDeleteRef = useCommittedRef(onDelete);
	const onActivateRef = useCommittedRef(onActivate);
	const [entry] = useState<ScopeEntry>(() => ({
		hasSelection: () => hasSelectionRef.current,
		clear: () => {
			clearSelectionRef.current();
		},
		deleteSelected: () => {
			if (!onDeleteRef.current || selectedIdsRef.current.length === 0) {
				return false;
			}
			const ids = [...selectedIdsRef.current];
			clearSelectionRef.current();
			onDeleteRef.current(ids);
			return true;
		},
	}));

	useEffect(() => {
		if (!hasSelection) {
			return;
		}

		onActivateRef.current?.();
		return activateScope({ entry });
	}, [entry, hasSelection, selectedIds, onActivateRef]);
}
