//=============================================================================
/*:
 * @plugindesc Adds new animation for target selection
 * @author BlackRaison
 *
 * @param Bitmap Name
 * @desc The file name NOTE:: It must be located in your img\system folder
 * Default: selection_cursor
 * @default selection_cursor
 *
 * @param Actor Offset y
 * @desc Additional Offset for the Selection cursor for Actors
 * Default: 70
 * @default 70
 *
 * @param Enemy Offset y
 * @desc Additional Offset for the Selection cursor for Enemies (Only active in Automatic Tuning Mode)
 * Default: 50
 * @default 50
 *
 * @param Bitmap Size
 * @desc Sets the size of the WINDOW that contains the bitmap
 * Default: 50
 * @default 50
 */

(function(){

	var BlkRaison = BlkRaison || {};

	BlkRaison.Parameters = PluginManager.parameters('BLKR_PrettyBattleSelector');
	BlkRaison.Param = BlkRaison.Param || {};

	BlkRaison.Param.ActorOffsetY = Number(BlkRaison.Parameters['Actor Offset y']);
	BlkRaison.Param.EnemyOffsetY = Number(BlkRaison.Parameters['Enemy Offset y']);
	BlkRaison.Param.BitmapSize = Number(BlkRaison.Parameters['Bitmap Size']);
	BlkRaison.Param.selectioncursor = String(BlkRaison.Parameters['Bitmap Name']);

	_BLKR_Sprite_Battler_updateSelectionEffect = Sprite_Battler.prototype.updateSelectionEffect;
	Sprite_Battler.prototype.updateSelectionEffect = function() {
		if (this._battler.isSelected()){
	    	this._selectionIcon.alpha = 1;
	        this._selectionWindow.y = this._originaly + Math.sin(this._selectionEffectCount/20) * 10;
	    } else if (this._selectionEffectCount > 0) {
	        this._selectionWindow.y = this._originaly;
	        this._selectionIcon.alpha = 0;
	    }
	    _BLKR_Sprite_Battler_updateSelectionEffect.call(this);
	};
		
	    

	_BLKR_Sprite_Actor_updateBitmap = Sprite_Actor.prototype.updateBitmap;
	Sprite_Actor.prototype.updateBitmap = function() {
		var name = this._actor.battlerName();
	    if (!this._selectionWindow) {
	        this.createSelectorWindow();
	    }
	    _BLKR_Sprite_Actor_updateBitmap.call(this);
		
	};

	Sprite_Actor.prototype.createSelectorWindow = function() {
		var height = this.children[0]._bitmap._canvas.height;
		this._selectionWindow = new Window_Base(0-BlkRaison.Param.BitmapSize/2, -height-BlkRaison.Param.ActorOffsetY, BlkRaison.Param.BitmapSize, BlkRaison.Param.BitmapSize);
		this._originaly = this._selectionWindow.y;
		
		this._selectionWindow.setBackgroundType(2);
		this.createSelectorIcon();
		this.addChild(this._selectionWindow);
	};

	_BLKR_Sprite_enemy_updateBitmap = Sprite_Enemy.prototype.updateBitmap;
	Sprite_Enemy.prototype.updateBitmap = function() {
		_BLKR_Sprite_enemy_updateBitmap.call(this);
	    Sprite_Battler.prototype.updateBitmap.call(this);
	    if (!this._selectionWindow){
	        this.createSelectorWindow();
	    }
	};

	Sprite_Enemy.prototype.createSelectorWindow = function() {
		var height = this._bitmap._image.height;
		if (height === 0){
			console.log(this);
			return;
		}
		this._selectionWindow = new Window_Base(0-BlkRaison.Param.BitmapSize/2, -height-BlkRaison.Param.EnemyOffsetY, BlkRaison.Param.BitmapSize, BlkRaison.Param.BitmapSize);
		this._originaly = this._selectionWindow.y;
		
		this._selectionWindow.setBackgroundType(2);
		this.createSelectorIcon();
		this.addChild(this._selectionWindow);
	};

	Sprite_Battler.prototype.createSelectorIcon = function() {
		this._selectionIcon = new Sprite();
		this._selectionIcon.bitmap = ImageManager.loadSystem("" + BlkRaison.Param.selectioncursor);
		this._selectionWindow.addChild(this._selectionIcon);
		this._selectionIcon.alpha = 0;
	};

	

})();