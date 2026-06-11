# Arquitectura y P2P Mesh

El ecosistema **Shelf** rompe con el paradigma tradicional cliente-servidor, adoptando un enfoque 100% Peer-to-Peer (P2P).

## Malla P2P (WebRTC)

Shelf utiliza WebRTC para establecer conexiones bidireccionales directas entre los dispositivos de la tienda. 

1. **Host (Master Node):** Un dispositivo inicializa la red y actúa como servidor de señalización (broker). Posee permisos de Admin automáticamente.
2. **Peers (Nodos):** Otros dispositivos escanean un código QR para unirse a la malla.
3. **Descubrimiento:** Una vez que un Peer se conecta al Host, el Host distribuye una lista de todos los Peers conocidos (`PEER_LIST_UPDATE`). Los Peers entonces establecen conexiones directas entre sí para formar una malla completa (Full Mesh).

## Abstracción del Motor (`p2p-mesh-core`)

La lógica de sincronización está extraída en el paquete `p2p-mesh-core`. Este paquete exporta la clase `P2PManager`, la cual se encarga de:
* Gestionar las conexiones de `PeerJS`.
* Realizar el Handshake Criptográfico Post-Cuántico.
* Descifrar y cifrar cargas útiles asíncronas de manera transparente.
* Emitir eventos locales (`onMessage`, `onConnectionChange`) hacia la UI de la aplicación (React).
