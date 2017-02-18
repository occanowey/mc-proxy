const net    = require( 'net' );
const debug  = require( 'debug' );
const varint = require( 'varint' );

const State = require( './state.js' );

const config = require( '../config.json' );

let debugSocket = debug( 'socket' );

function socketListener( s ) {
   debugSocket( 'new connection' );

   s.info = {
      state    : State.HANDSHAKING,
      encrypted: false
   };

   function handlePacket( packet ) {
      let offset = 0;

      let length = varint.decode( packet );
      offset += varint.decode.bytes;

      let id = varint.decode( packet, offset );
      offset += varint.decode.bytes;

      debugSocket( `recieved new packet #${id} of length ${length} at state: ${State.toString( s.info.state )}` );

      if( s.info.state === State.HANDSHAKING ) {
         if( id === 0 ) { // Handshake
            let version = varint.decode( packet, offset );
            offset += varint.decode.bytes;

            let addressLength = varint.decode( packet, offset );
            offset += varint.decode.bytes;

            let address = packet.toString( 'utf8', offset, offset + addressLength );
            offset += addressLength;

            let port = packet.readUInt16BE( offset );
            offset += 2;

            let nextState = varint.decode( packet, offset );

            s.info.version = version;
            s.info.address = address;
            s.info.port    = port;
            s.info.state   = nextState;

            debugSocket( 'Handshake:', { version, address, port, nextState } );
         }

         return;
      }
   }

   let chunkBuffer = Buffer.alloc( 0 );

   function handleChunk( chunk ) {
      // combine the buffer and latest chunk to be split into correct sized packets later.
      if( chunk )
         chunkBuffer = Buffer.concat( [ chunkBuffer, chunk ] );

      // don't attempt to process non-existent data.
      if( chunkBuffer.length === 0 )
         return;

      // get the current packet length.
      let packetLength = varint.decode( chunkBuffer );
      packetLength += varint.decode.bytes;

      // return if the buffer does not contain the full packet.
      if( packetLength > chunkBuffer.length )
         return;

      // if it does split it into its own buffer to be processed.
      let packet = Buffer.alloc( packetLength );
      chunkBuffer.copy( packet, 0, 0, packetLength );

      // remove the packet from the buffer.
      chunkBuffer = chunkBuffer.slice( packetLength, chunkBuffer.length );

      // handle packet and any remaing data in the buffer.
      handlePacket( packet );
      handleChunk();
   }

   s.on( 'data', handleChunk );

   s.on( 'end', () => {
      debugSocket( 'disconnected' );
   } );
}

const server = net.createServer( {}, socketListener );

server.on( 'error', err => {
   throw err;
} );

server.listen( config.port, () => {
   console.log( 'Server started on port:', config.port );
} );
