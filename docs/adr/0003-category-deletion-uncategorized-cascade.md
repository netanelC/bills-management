# Category Deletion Reverts Associated Entities to Uncategorized

When a Category is deleted, any Merchants having that Category as their default and any Transactions with explicit overrides for it have their category references set to `null` (`ON DELETE SET NULL`) rather than cascading transaction deletion or blocking category deletion. This allows full customization of household categories while safeguarding raw statement transaction history and automatically queuing affected merchants in the Uncategorized Inbox for re-triaging.
