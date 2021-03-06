/**
 * External dependencies
 */
import classnames from 'classnames';
import {
	find,
	get,
	isEmpty,
	map,
	last,
	omit,
	pick,
} from 'lodash';

/**
 * WordPress dependencies
 */
import { getBlobByURL, isBlobURL, revokeBlobURL } from '@wordpress/blob';
import {
	Button,
	ButtonGroup,
	ExternalLink,
	IconButton,
	MenuItem,
	NavigableMenu,
	PanelBody,
	Path,
	ResizableBox,
	SelectControl,
	Spinner,
	SVG,
	TextareaControl,
	TextControl,
	ToggleControl,
	ToolbarGroup,
	withNotices,
} from '@wordpress/components';
import { compose } from '@wordpress/compose';
import {
	LEFT,
	RIGHT,
	UP,
	DOWN,
	BACKSPACE,
	ENTER,
} from '@wordpress/keycodes';
import { withSelect, withDispatch } from '@wordpress/data';
import {
	BlockAlignmentToolbar,
	BlockControls,
	BlockIcon,
	InspectorControls,
	InspectorAdvancedControls,
	MediaPlaceholder,
	MediaReplaceFlow,
	URLPopover,
	RichText,
} from '@wordpress/block-editor';
import {
	Component,
	useCallback,
	useState,
	useRef,
} from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { getPath } from '@wordpress/url';
import { withViewportMatch } from '@wordpress/viewport';

/**
 * Internal dependencies
 */
import { createUpgradedEmbedBlock } from '../embed/util';
import icon from './icon';
import ImageSize from './image-size';
import { getUpdatedLinkTargetSettings, removeNewTabRel } from './utils';

/**
 * Module constants
 */
import {
	MIN_SIZE,
	LINK_DESTINATION_NONE,
	LINK_DESTINATION_MEDIA,
	LINK_DESTINATION_ATTACHMENT,
	LINK_DESTINATION_CUSTOM,
	ALLOWED_MEDIA_TYPES,
	DEFAULT_SIZE_SLUG,
} from './constants';

export const pickRelevantMediaFiles = ( image ) => {
	const imageProps = pick( image, [ 'alt', 'id', 'link', 'caption' ] );
	imageProps.url = get( image, [ 'sizes', 'large', 'url' ] ) || get( image, [ 'media_details', 'sizes', 'large', 'source_url' ] ) || image.url;
	return imageProps;
};

/**
 * Is the URL a temporary blob URL? A blob URL is one that is used temporarily
 * while the image is being uploaded and will not have an id yet allocated.
 *
 * @param {number=} id The id of the image.
 * @param {string=} url The url of the image.
 *
 * @return {boolean} Is the URL a Blob URL
 */
const isTemporaryImage = ( id, url ) => ! id && isBlobURL( url );

/**
 * Is the url for the image hosted externally. An externally hosted image has no id
 * and is not a blob url.
 *
 * @param {number=} id  The id of the image.
 * @param {string=} url The url of the image.
 *
 * @return {boolean} Is the url an externally hosted url?
 */
const isExternalImage = ( id, url ) => url && ! id && ! isBlobURL( url );

const stopPropagation = ( event ) => {
	event.stopPropagation();
};

const stopPropagationRelevantKeys = ( event ) => {
	if ( [ LEFT, DOWN, RIGHT, UP, BACKSPACE, ENTER ].indexOf( event.keyCode ) > -1 ) {
		// Stop the key event from propagating up to ObserveTyping.startTypingInTextField.
		event.stopPropagation();
	}
};

const ImageURLInputUI = ( {
	advancedOptions,
	linkDestination,
	mediaLinks,
	onChangeUrl,
	url,
} ) => {
	const [ isOpen, setIsOpen ] = useState( false );
	const openLinkUI = useCallback( () => {
		setIsOpen( true );
	} );

	const [ isEditingLink, setIsEditingLink ] = useState( false );
	const [ urlInput, setUrlInput ] = useState( null );

	const startEditLink = useCallback( () => {
		if ( linkDestination === LINK_DESTINATION_MEDIA ||
			linkDestination === LINK_DESTINATION_ATTACHMENT
		) {
			setUrlInput( '' );
		}
		setIsEditingLink( true );
	} );
	const stopEditLink = useCallback( () => {
		setIsEditingLink( false );
	} );

	const closeLinkUI = useCallback( () => {
		setUrlInput( null );
		stopEditLink();
		setIsOpen( false );
	} );

	const autocompleteRef = useRef( null );

	const onClickOutside = useCallback( () => {
		return ( event ) => {
			// The autocomplete suggestions list renders in a separate popover (in a portal),
			// so onClickOutside fails to detect that a click on a suggestion occurred in the
			// LinkContainer. Detect clicks on autocomplete suggestions using a ref here, and
			// return to avoid the popover being closed.
			const autocompleteElement = autocompleteRef.current;
			if ( autocompleteElement && autocompleteElement.contains( event.target ) ) {
				return;
			}
			setIsOpen( false );
			setUrlInput( null );
			stopEditLink();
		};
	} );

	const onSubmitLinkChange = useCallback( () => {
		return ( event ) => {
			if ( urlInput ) {
				onChangeUrl( urlInput );
			}
			stopEditLink();
			setUrlInput( null );
			event.preventDefault();
		};
	} );

	const onLinkRemove = useCallback( () => {
		closeLinkUI();
		onChangeUrl( '' );
	} );
	const linkEditorValue = urlInput !== null ? urlInput : url;

	const urlLabel = (
		find( mediaLinks, [ 'linkDestination', linkDestination ] ) || {}
	).title;
	return (
		<>
			<IconButton
				icon="admin-links"
				className="components-toolbar__control"
				label={ url ? __( 'Edit link' ) : __( 'Insert link' ) }
				aria-expanded={ isOpen }
				onClick={ openLinkUI }
			/>
			{ isOpen && (
				<URLPopover
					onClickOutside={ onClickOutside() }
					onClose={ closeLinkUI }
					renderSettings={ () => advancedOptions }
					additionalControls={ ! linkEditorValue && (
						<NavigableMenu>
							{
								map( mediaLinks, ( link ) => (
									<MenuItem
										key={ link.linkDestination }
										icon={ link.icon }
										onClick={ () => {
											setUrlInput( null );
											onChangeUrl( link.url );
											stopEditLink();
										} }
									>
										{ link.title }
									</MenuItem>
								) )
							}
						</NavigableMenu>
					) }
				>
					{ ( ! url || isEditingLink ) && (
						<URLPopover.LinkEditor
							className="editor-format-toolbar__link-container-content block-editor-format-toolbar__link-container-content"
							value={ linkEditorValue }
							onChangeInputValue={ setUrlInput }
							onKeyDown={ stopPropagationRelevantKeys }
							onKeyPress={ stopPropagation }
							onSubmit={ onSubmitLinkChange() }
							autocompleteRef={ autocompleteRef }
						/>
					) }
					{ ( url && ! isEditingLink ) && (
						<>
							<URLPopover.LinkViewer
								className="editor-format-toolbar__link-container-content block-editor-format-toolbar__link-container-content"
								onKeyPress={ stopPropagation }
								url={ url }
								onEditLinkClick={ startEditLink }
								urlLabel={ urlLabel }
							/>
							<IconButton
								icon="no"
								label={ __( 'Remove link' ) }
								onClick={ onLinkRemove }
							/>
						</>
					) }
				</URLPopover>
			) }
		</>
	);
};

export class ImageEdit extends Component {
	constructor() {
		super( ...arguments );
		this.updateAlt = this.updateAlt.bind( this );
		this.updateAlignment = this.updateAlignment.bind( this );
		this.onFocusCaption = this.onFocusCaption.bind( this );
		this.onImageClick = this.onImageClick.bind( this );
		this.onSelectImage = this.onSelectImage.bind( this );
		this.onSelectURL = this.onSelectURL.bind( this );
		this.updateImage = this.updateImage.bind( this );
		this.updateWidth = this.updateWidth.bind( this );
		this.updateHeight = this.updateHeight.bind( this );
		this.updateDimensions = this.updateDimensions.bind( this );
		this.onSetHref = this.onSetHref.bind( this );
		this.onSetLinkClass = this.onSetLinkClass.bind( this );
		this.onSetLinkRel = this.onSetLinkRel.bind( this );
		this.onSetNewTab = this.onSetNewTab.bind( this );
		this.onSetTitle = this.onSetTitle.bind( this );
		this.getFilename = this.getFilename.bind( this );
		this.onUploadError = this.onUploadError.bind( this );
		this.onImageError = this.onImageError.bind( this );
		this.getLinkDestinations = this.getLinkDestinations.bind( this );

		this.state = {
			captionFocused: false,
		};
	}

	componentDidMount() {
		const {
			attributes,
			mediaUpload,
			noticeOperations,
		} = this.props;
		const { id, url = '' } = attributes;

		if ( isTemporaryImage( id, url ) ) {
			const file = getBlobByURL( url );

			if ( file ) {
				mediaUpload( {
					filesList: [ file ],
					onFileChange: ( [ image ] ) => {
						this.onSelectImage( image );
					},
					allowedTypes: ALLOWED_MEDIA_TYPES,
					onError: ( message ) => {
						noticeOperations.createErrorNotice( message );
					},
				} );
			}
		}
	}

	componentDidUpdate( prevProps ) {
		const { id: prevID, url: prevURL = '' } = prevProps.attributes;
		const { id, url = '' } = this.props.attributes;

		if ( isTemporaryImage( prevID, prevURL ) && ! isTemporaryImage( id, url ) ) {
			revokeBlobURL( url );
		}

		if ( ! this.props.isSelected && prevProps.isSelected && this.state.captionFocused ) {
			this.setState( {
				captionFocused: false,
			} );
		}
	}

	onUploadError( message ) {
		const { noticeOperations } = this.props;
		noticeOperations.removeAllNotices();
		noticeOperations.createErrorNotice( message );
	}

	onSelectImage( media ) {
		if ( ! media || ! media.url ) {
			this.props.setAttributes( {
				url: undefined,
				alt: undefined,
				id: undefined,
				title: undefined,
				caption: undefined,
			} );
			return;
		}

		const { id, url, alt, caption, linkDestination } = this.props.attributes;

		let mediaAttributes = pickRelevantMediaFiles( media );

		// If the current image is temporary but an alt or caption text was meanwhile written by the user,
		// make sure the text is not overwritten.
		if ( isTemporaryImage( id, url ) ) {
			if ( alt ) {
				mediaAttributes = omit( mediaAttributes, [ 'alt' ] );
			}
			if ( caption ) {
				mediaAttributes = omit( mediaAttributes, [ 'caption' ] );
			}
		}

		let additionalAttributes;
		// Reset the dimension attributes if changing to a different image.
		if ( ! media.id || media.id !== id ) {
			additionalAttributes = {
				width: undefined,
				height: undefined,
				sizeSlug: DEFAULT_SIZE_SLUG,
			};
		} else {
			// Keep the same url when selecting the same file, so "Image Size" option is not changed.
			additionalAttributes = { url };
		}

		// Check if the image is linked to it's media.
		if ( linkDestination === LINK_DESTINATION_MEDIA ) {
			// Update the media link.
			mediaAttributes.href = media.url;
		}

		// Check if the image is linked to the attachment page.
		if ( linkDestination === LINK_DESTINATION_ATTACHMENT ) {
			// Update the media link.
			mediaAttributes.href = media.link;
		}

		this.props.setAttributes( {
			...mediaAttributes,
			...additionalAttributes,
		} );
	}

	onSelectURL( newURL ) {
		const { url } = this.props.attributes;

		if ( newURL !== url ) {
			this.props.setAttributes( {
				url: newURL,
				id: undefined,
				sizeSlug: DEFAULT_SIZE_SLUG,
			} );
		}
	}

	onImageError( url ) {
		// Check if there's an embed block that handles this URL.
		const embedBlock = createUpgradedEmbedBlock(
			{ attributes: { url } }
		);
		if ( undefined !== embedBlock ) {
			this.props.onReplace( embedBlock );
		}
	}

	onSetHref( value ) {
		const linkDestinations = this.getLinkDestinations();
		const { attributes } = this.props;
		const { linkDestination } = attributes;
		let linkDestinationInput;
		if ( ! value ) {
			linkDestinationInput = LINK_DESTINATION_NONE;
		} else {
			linkDestinationInput = (
				find( linkDestinations, ( destination ) => {
					return destination.url === value;
				} ) ||
				{ linkDestination: LINK_DESTINATION_CUSTOM }
			).linkDestination;
		}
		if ( linkDestination !== linkDestinationInput ) {
			this.props.setAttributes( {
				linkDestination: linkDestinationInput,
				href: value,
			} );
			return;
		}
		this.props.setAttributes( { href: value } );
	}

	onSetTitle( value ) {
		// This is the HTML title attribute, separate from the media object title
		this.props.setAttributes( { title: value } );
	}

	onSetLinkClass( value ) {
		this.props.setAttributes( { linkClass: value } );
	}

	onSetLinkRel( value ) {
		this.props.setAttributes( { rel: value } );
	}

	onSetNewTab( value ) {
		const updatedLinkTarget = getUpdatedLinkTargetSettings( value, this.props.attributes );
		this.props.setAttributes( updatedLinkTarget );
	}

	onFocusCaption() {
		if ( ! this.state.captionFocused ) {
			this.setState( {
				captionFocused: true,
			} );
		}
	}

	onImageClick() {
		if ( this.state.captionFocused ) {
			this.setState( {
				captionFocused: false,
			} );
		}
	}

	updateAlt( newAlt ) {
		this.props.setAttributes( { alt: newAlt } );
	}

	updateAlignment( nextAlign ) {
		const extraUpdatedAttributes = [ 'wide', 'full' ].indexOf( nextAlign ) !== -1 ?
			{ width: undefined, height: undefined } :
			{};
		this.props.setAttributes( { ...extraUpdatedAttributes, align: nextAlign } );
	}

	updateImage( sizeSlug ) {
		const { image } = this.props;

		const url = get( image, [ 'media_details', 'sizes', sizeSlug, 'source_url' ] );
		if ( ! url ) {
			return null;
		}

		this.props.setAttributes( {
			url,
			width: undefined,
			height: undefined,
			sizeSlug,
		} );
	}

	updateWidth( width ) {
		this.props.setAttributes( { width: parseInt( width, 10 ) } );
	}

	updateHeight( height ) {
		this.props.setAttributes( { height: parseInt( height, 10 ) } );
	}

	updateDimensions( width = undefined, height = undefined ) {
		return () => {
			this.props.setAttributes( { width, height } );
		};
	}

	getFilename( url ) {
		const path = getPath( url );
		if ( path ) {
			return last( path.split( '/' ) );
		}
	}

	getLinkDestinations() {
		return [
			{
				linkDestination: LINK_DESTINATION_MEDIA,
				title: __( 'Media File' ),
				url: ( this.props.image && this.props.image.source_url ) ||
					this.props.attributes.url,
				icon,
			},
			{
				linkDestination: LINK_DESTINATION_ATTACHMENT,
				title: __( 'Attachment Page' ),
				url: this.props.image && this.props.image.link,
				icon: <SVG viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><Path d="M0 0h24v24H0V0z" fill="none" /><Path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" /></SVG>,
			},
		];
	}

	getImageSizeOptions() {
		const { imageSizes } = this.props;
		return map( imageSizes, ( { name, slug } ) => ( { value: slug, label: name } ) );
	}

	render() {
		const {
			attributes,
			setAttributes,
			isLargeViewport,
			isSelected,
			className,
			maxWidth,
			noticeUI,
			isRTL,
			onResizeStart,
			onResizeStop,
		} = this.props;
		const {
			url,
			alt,
			caption,
			align,
			id,
			href,
			rel,
			linkClass,
			linkDestination,
			title,
			width,
			height,
			linkTarget,
			sizeSlug,
		} = attributes;

		const cleanRel = removeNewTabRel( rel );
		const isExternal = isExternalImage( id, url );
		const controls = (
			<BlockControls>
				<BlockAlignmentToolbar
					value={ align }
					onChange={ this.updateAlignment }
				/>
				{ url && <MediaReplaceFlow
					mediaURL={ url }
					allowedTypes={ ALLOWED_MEDIA_TYPES }
					accept="image/*"
					onSelect={ this.onSelectImage }
					onSelectURL={ this.onSelectURL }
					onError={ this.onUploadError }
				/> }
				{ url && (
					<ToolbarGroup>
						<ImageURLInputUI
							url={ href || '' }
							onChangeUrl={ this.onSetHref }
							mediaLinks={ this.getLinkDestinations() }
							linkDestination={ linkDestination }
							advancedOptions={
								<>
									<ToggleControl
										label={ __( 'Open in New Tab' ) }
										onChange={ this.onSetNewTab }
										checked={ linkTarget === '_blank' } />
									<TextControl
										label={ __( 'Link Rel' ) }
										value={ cleanRel || '' }
										onChange={ this.onSetLinkRel }
										onKeyPress={ stopPropagation }
										onKeyDown={ stopPropagationRelevantKeys }
									/>
									<TextControl
										label={ __( 'Link CSS Class' ) }
										value={ linkClass || '' }
										onKeyPress={ stopPropagation }
										onKeyDown={ stopPropagationRelevantKeys }
										onChange={ this.onSetLinkClass }
									/>
								</>
							}
						/>
					</ToolbarGroup>
				) }
			</BlockControls>
		);
		const src = isExternal ? url : undefined;
		const labels = {
			title: ! url ? __( 'Image' ) : __( 'Edit image' ),
			instructions: __( 'Upload an image file, pick one from your media library, or add one with a URL.' ),
		};
		const mediaPreview = ( !! url && <img
			alt={ __( 'Edit image' ) }
			title={ __( 'Edit image' ) }
			className={ 'edit-image-preview' }
			src={ url }
		/> );
		const mediaPlaceholder = (
			<MediaPlaceholder
				icon={ <BlockIcon icon={ icon } /> }
				className={ className }
				labels={ labels }
				onSelect={ this.onSelectImage }
				onSelectURL={ this.onSelectURL }
				notices={ noticeUI }
				onError={ this.onUploadError }
				accept="image/*"
				allowedTypes={ ALLOWED_MEDIA_TYPES }
				value={ { id, src } }
				mediaPreview={ mediaPreview }
				disableMediaButtons={ url }
			/>
		);
		if ( ! url ) {
			return (
				<>
					{ controls }
					{ mediaPlaceholder }
				</>
			);
		}

		const classes = classnames( className, {
			'is-transient': isBlobURL( url ),
			'is-resized': !! width || !! height,
			'is-focused': isSelected,
			[ `size-${ sizeSlug }` ]: sizeSlug,
		} );

		const isResizable = [ 'wide', 'full' ].indexOf( align ) === -1 && isLargeViewport;

		const imageSizeOptions = this.getImageSizeOptions();

		const getInspectorControls = ( imageWidth, imageHeight ) => (
			<>
				<InspectorControls>
					<PanelBody title={ __( 'Image Settings' ) }>
						<TextareaControl
							label={ __( 'Alt Text (Alternative Text)' ) }
							value={ alt }
							onChange={ this.updateAlt }
							help={
								<>
									<ExternalLink href="https://www.w3.org/WAI/tutorials/images/decision-tree">
										{ __( 'Describe the purpose of the image' ) }
									</ExternalLink>
									{ __( 'Leave empty if the image is purely decorative.' ) }
								</>
							}
						/>
						{ ! isEmpty( imageSizeOptions ) && (
							<SelectControl
								label={ __( 'Image Size' ) }
								value={ sizeSlug }
								options={ imageSizeOptions }
								onChange={ this.updateImage }
							/>
						) }
						{ isResizable && (
							<div className="block-library-image__dimensions">
								<p className="block-library-image__dimensions__row">
									{ __( 'Image Dimensions' ) }
								</p>
								<div className="block-library-image__dimensions__row">
									<TextControl
										type="number"
										className="block-library-image__dimensions__width"
										label={ __( 'Width' ) }
										value={ width || imageWidth || '' }
										min={ 1 }
										onChange={ this.updateWidth }
									/>
									<TextControl
										type="number"
										className="block-library-image__dimensions__height"
										label={ __( 'Height' ) }
										value={ height || imageHeight || '' }
										min={ 1 }
										onChange={ this.updateHeight }
									/>
								</div>
								<div className="block-library-image__dimensions__row">
									<ButtonGroup aria-label={ __( 'Image Size' ) }>
										{ [ 25, 50, 75, 100 ].map( ( scale ) => {
											const scaledWidth = Math.round( imageWidth * ( scale / 100 ) );
											const scaledHeight = Math.round( imageHeight * ( scale / 100 ) );

											const isCurrent = width === scaledWidth && height === scaledHeight;

											return (
												<Button
													key={ scale }
													isSmall
													isPrimary={ isCurrent }
													aria-pressed={ isCurrent }
													onClick={ this.updateDimensions( scaledWidth, scaledHeight ) }
												>
													{ scale }%
												</Button>
											);
										} ) }
									</ButtonGroup>
									<Button
										isSmall
										onClick={ this.updateDimensions() }
									>
										{ __( 'Reset' ) }
									</Button>
								</div>
							</div>
						) }
					</PanelBody>
				</InspectorControls>
				<InspectorAdvancedControls>
					<TextControl
						label={ __( 'Title Attribute' ) }
						value={ title || '' }
						onChange={ this.onSetTitle }
						help={
							<>
								{ __( 'Describe the role of this image on the page.' ) }
								<ExternalLink href="https://www.w3.org/TR/html52/dom.html#the-title-attribute">
									{ __( '(Note: many devices and browsers do not display this text.)' ) }
								</ExternalLink>
							</>
						}
					/>
				</InspectorAdvancedControls>
			</>
		);

		// Disable reason: Each block can be selected by clicking on it
		/* eslint-disable jsx-a11y/click-events-have-key-events */
		return (
			<>
				{ controls }
				<figure className={ classes }>
					<ImageSize src={ url } dirtynessTrigger={ align }>
						{ ( sizes ) => {
							const {
								imageWidthWithinContainer,
								imageHeightWithinContainer,
								imageWidth,
								imageHeight,
							} = sizes;

							const filename = this.getFilename( url );
							let defaultedAlt;
							if ( alt ) {
								defaultedAlt = alt;
							} else if ( filename ) {
								defaultedAlt = sprintf( __( 'This image has an empty alt attribute; its file name is %s' ), filename );
							} else {
								defaultedAlt = __( 'This image has an empty alt attribute' );
							}

							const img = (
								// Disable reason: Image itself is not meant to be interactive, but
								// should direct focus to block.
								/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
								<>
									<img
										src={ url }
										alt={ defaultedAlt }
										onClick={ this.onImageClick }
										onError={ () => this.onImageError( url ) }
									/>
									{ isBlobURL( url ) && <Spinner /> }
								</>
								/* eslint-enable jsx-a11y/no-noninteractive-element-interactions */
							);

							if ( ! isResizable || ! imageWidthWithinContainer ) {
								return (
									<>
										{ getInspectorControls( imageWidth, imageHeight ) }
										<div style={ { width, height } }>
											{ img }
										</div>
									</>
								);
							}

							const currentWidth = width || imageWidthWithinContainer;
							const currentHeight = height || imageHeightWithinContainer;

							const ratio = imageWidth / imageHeight;
							const minWidth = imageWidth < imageHeight ? MIN_SIZE : MIN_SIZE * ratio;
							const minHeight = imageHeight < imageWidth ? MIN_SIZE : MIN_SIZE / ratio;

							// With the current implementation of ResizableBox, an image needs an explicit pixel value for the max-width.
							// In absence of being able to set the content-width, this max-width is currently dictated by the vanilla editor style.
							// The following variable adds a buffer to this vanilla style, so 3rd party themes have some wiggleroom.
							// This does, in most cases, allow you to scale the image beyond the width of the main column, though not infinitely.
							// @todo It would be good to revisit this once a content-width variable becomes available.
							const maxWidthBuffer = maxWidth * 2.5;

							let showRightHandle = false;
							let showLeftHandle = false;

							/* eslint-disable no-lonely-if */
							// See https://github.com/WordPress/gutenberg/issues/7584.
							if ( align === 'center' ) {
								// When the image is centered, show both handles.
								showRightHandle = true;
								showLeftHandle = true;
							} else if ( isRTL ) {
								// In RTL mode the image is on the right by default.
								// Show the right handle and hide the left handle only when it is aligned left.
								// Otherwise always show the left handle.
								if ( align === 'left' ) {
									showRightHandle = true;
								} else {
									showLeftHandle = true;
								}
							} else {
								// Show the left handle and hide the right handle only when the image is aligned right.
								// Otherwise always show the right handle.
								if ( align === 'right' ) {
									showLeftHandle = true;
								} else {
									showRightHandle = true;
								}
							}
							/* eslint-enable no-lonely-if */

							return (
								<>
									{ getInspectorControls( imageWidth, imageHeight ) }
									<ResizableBox
										size={ {
											width,
											height,
										} }
										minWidth={ minWidth }
										maxWidth={ maxWidthBuffer }
										minHeight={ minHeight }
										maxHeight={ maxWidthBuffer / ratio }
										lockAspectRatio
										enable={ {
											top: false,
											right: showRightHandle,
											bottom: true,
											left: showLeftHandle,
										} }
										onResizeStart={ onResizeStart }
										onResizeStop={ ( event, direction, elt, delta ) => {
											onResizeStop();
											setAttributes( {
												width: parseInt( currentWidth + delta.width, 10 ),
												height: parseInt( currentHeight + delta.height, 10 ),
											} );
										} }
									>
										{ img }
									</ResizableBox>
								</>
							);
						} }
					</ImageSize>
					{ ( ! RichText.isEmpty( caption ) || isSelected ) && (
						<RichText
							tagName="figcaption"
							placeholder={ __( 'Write caption…' ) }
							value={ caption }
							unstableOnFocus={ this.onFocusCaption }
							onChange={ ( value ) => setAttributes( { caption: value } ) }
							isSelected={ this.state.captionFocused }
							inlineToolbar
						/>
					) }
				</figure>
				{ mediaPlaceholder }
			</>
		);
		/* eslint-enable jsx-a11y/click-events-have-key-events */
	}
}

export default compose( [
	withDispatch( ( dispatch ) => {
		const { toggleSelection } = dispatch( 'core/block-editor' );

		return {
			onResizeStart: () => toggleSelection( false ),
			onResizeStop: () => toggleSelection( true ),
		};
	} ),
	withSelect( ( select, props ) => {
		const { getMedia } = select( 'core' );
		const { getSettings } = select( 'core/block-editor' );
		const { attributes: { id }, isSelected } = props;
		const {
			mediaUpload,
			imageSizes,
			isRTL,
			maxWidth,
		} = getSettings();

		return {
			image: id && isSelected ? getMedia( id ) : null,
			maxWidth,
			isRTL,
			imageSizes,
			mediaUpload,
		};
	} ),
	withViewportMatch( { isLargeViewport: 'medium' } ),
	withNotices,
] )( ImageEdit );
