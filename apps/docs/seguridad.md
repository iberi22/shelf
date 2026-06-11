# Seguridad y Criptografía Post-Cuántica (PQC)

El motor P2P de Shelf (`p2p-mesh-core`) implementa seguridad **Zero Trust** entre nodos utilizando algoritmos resistentes a ataques cuánticos.

## Handshake ML-KEM-768

Antes de que dos nodos comiencen a sincronizar datos, realizan un intercambio de llaves:
1. El iniciador genera un par de llaves **ML-KEM-768** y envía la llave pública en claro vía WebRTC.
2. El receptor encapsula un "Secreto Compartido" usando la llave pública del iniciador, y devuelve el texto cifrado (ciphertext).
3. El iniciador desencapsula el texto cifrado con su llave privada y ambos obtienen el mismo secreto.

## Cifrado AES-GCM (En tránsito)

El secreto post-cuántico se deriva mediante HKDF para obtener una llave simétrica AES-GCM de 256 bits. 
Todos los eventos de mutación CRDT (`YJS_UPDATE`) y actualizaciones de estado manuales (`STATE_UPDATE`) se transmiten como un `ENCRYPTED_PAYLOAD`, garantizando que si WebRTC falla o la conexión es interceptada, la información sigue siendo indescifrable.

## Próximos Pasos (Firmas Digitales)
Próximamente se implementarán firmas **ML-DSA-65** para validar de manera inequívoca la identidad de los administradores (host) y prevenir falsificación de mensajes P2P.
