# Room and door registry

heist-foundry-2.1.1 has 34 rooms across three levels, including six service stair halls, and 38 doors. Coordinates are in meters and are measured at the finished floor.

| Floor | Room ID | Name | Kind | Center X, Y, Z | Door IDs |
| --- | --- | --- | --- | --- | --- |
| B1 | B1-stair-west | West stair hall | stairs | -21, -4.4, -10.4 | B1-stair-west-door |
| B1 | B1-records | Secure records archive | archive | -11.65, -4.4, -14.2 | B1-records-door |
| B1 | B1-antechamber | Vault antechamber | lounge | -11.65, -4.4, -5.6 | B1-antechamber-door |
| B1 | B1-servers | Server room | server | -19.5, -4.4, 6.1 | B1-servers-door |
| B1 | B1-inventory | Inventory stores | storage | -19.5, -4.4, 14.7 | B1-inventory-door |
| B1 | B1-archive-west | West archive | archive | -5.9, -4.4, 10.4 | B1-archive-west-door |
| B1 | B1-stair-east | East stair hall | stairs | 21, -4.4, -10.4 | B1-stair-east-door |
| B1 | B1-reserve | Reserve storage | storage | 11.65, -4.4, -14.2 | B1-reserve-door |
| B1 | B1-guard-station | Vault administration office | office | 11.65, -4.4, -5.6 | B1-guard-station-door |
| B1 | B1-hvac | Mechanical room | mechanical | 19.5, -4.4, 6.1 | B1-hvac-door |
| B1 | B1-loading-annex | Receiving annex | storage | 19.5, -4.4, 14.7 | B1-loading-annex-door |
| B1 | B1-archive-east | East archive | archive | 5.9, -4.4, 10.4 | B1-archive-east-door |
| B1 | B1-vault | Central vault | vault | 0, -4.4, -15.275 | B1-vault-door |
| L1 | L1-stair-west | West stair hall | stairs | -21, 0, -10.4 | L1-stair-west-door |
| L1 | L1-admin-records | Administrative records | archive | -9.7, 0, -14.2 | L1-admin-records-door |
| L1 | L1-office-a | Member services | office | -9.7, 0, -5.6 | L1-office-a-door |
| L1 | L1-registration | Visitor registration | reception | -19.5, 0, 6.1 | L1-registration-door |
| L1 | L1-waiting | West waiting lounge | lounge | -19.5, 0, 14.7 | L1-waiting-door |
| L1 | L1-stair-east | East stair hall | stairs | 21, 0, -10.4 | L1-stair-east-door |
| L1 | L1-administration | Administration office | office | 9.7, 0, -14.2 | L1-administration-door |
| L1 | L1-security-ops | Operations office | office | 9.7, 0, -5.6 | L1-security-ops-door |
| L1 | L1-tellers | Private teller services | reception | 19.5, 0, 6.1 | L1-tellers-door |
| L1 | L1-waiting-east | East waiting lounge | lounge | 19.5, 0, 14.7 | L1-waiting-east-door |
| L1 | L1-lobby | Grand banking hall | lobby | 0, 0, 10.4 | L1-lobby-entry, L1-lobby-west-door, L1-lobby-east-door |
| L2 | L2-stair-west | West stair hall | stairs | -21, 4.4, -10.4 | L2-stair-west-door |
| L2 | L2-lab-a | Private banking office | office | -9.7, 4.4, -14.2 | L2-lab-a-door |
| L2 | L2-conference-a | Board conference room | conference | -9.7, 4.4, -5.6 | L2-conference-a-door |
| L2 | L2-executive | Executive office suite | executive | -19.5, 4.4, 6.1 | L2-executive-door |
| L2 | L2-documentation | Banking records library | archive | -19.5, 4.4, 14.7 | L2-documentation-door |
| L2 | L2-stair-east | East stair hall | stairs | 21, 4.4, -10.4 | L2-stair-east-door |
| L2 | L2-lab-c | Investment advisory office | office | 9.7, 4.4, -14.2 | L2-lab-c-door |
| L2 | L2-conference-b | Client meeting room | conference | 9.7, 4.4, -5.6 | L2-conference-b-door |
| L2 | L2-quiet-office | Legal and compliance office | office | 19.5, 4.4, 6.1 | L2-quiet-office-door |
| L2 | L2-break | Employee lounge | break | 19.5, 4.4, 14.7 | L2-break-door |

## Street entrances

| Entry ID | Name | Door ID | Door center X, Y, Z | Spawn X, Y, Z |
| --- | --- | --- | --- | --- |
| entrance-public | Main public entrance | L1-lobby-entry | 0, 0, 19 | 0, 0, 25 |
| entrance-service | East service entrance | entrance-service-door | 26, 0, 0 | 31, 0, 0 |
| entrance-staff | West staff entrance | entrance-staff-door | -26, 0, 0 | -31, 0, 0 |

The offline registry includes the building and street bounds, room connections, door dimensions, stairs, elevator and vault. See [registry.json](./assets/registry.json).
