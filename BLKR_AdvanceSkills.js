
//=============================================================================
/*:
 * @plugindesc Advance Skills
 * @author BlackRaison

 *==================TAGS==================
	<Rank:n>
	<MaxLevel:n>
 *
 * @param Level Up Base Requirement
 * @desc The amount of proficiency required to get the first level
 * Default: 30
 * @default 30
 *
 * @param Percentage Increase Per Level
 * @desc The amount the levelling requirement increases by each time
 * Default: 10
 * @default 10
 *
 * @param Unapplicable Skills
 * @desc Skills that do not have a proficiency
 * Default: 2 -> Attack and Guard do not have proficiency
 * @default 2
 */



(function(){

	var BlkRaison = BlkRaison || {};

	BlkRaison.Parameters = PluginManager.parameters('BLKR_AdvanceSkills');
	BlkRaison.Param = BlkRaison.Param || {};

	BlkRaison.Param.LevelUpBaseRequirement = Number(BlkRaison.Parameters['Level Up Base Requirement']);
	BlkRaison.Param.PercentageIncreasePerLevel = Number(BlkRaison.Parameters['Percentage Increase Per Level']);
	BlkRaison.Param.UnapplicableSkills = Number(BlkRaison.Parameters['Unapplicable Skills']);

	_BLKR_ADVS_DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
	DataManager.isDatabaseLoaded = function() {
		if (!_BLKR_ADVS_DataManager_isDatabaseLoaded.call(this)) return false;
		this.processADVNotetags($dataSkills);
		return true;
	};

	DataManager.processADVNotetags = function(data){
		var maxLevel = /<(?:Max Level):[ ]*(\d+\s*)>/i;
		var rank = /<(?:Rank):[ ]*([abcds]{1,2}\s*)>/i;
		for (var i = 1; i < data.length; i++){
			var entry = data[i];
			var notelist = entry.note.split(/[\r\n]+/);
			entry.maxLevel = 1;
			entry.rank = 'D';
			entry.effects = [];

			//Notetag parse for skill
			for (var j = 0; j < notelist.length; j++){
				if (notelist[j].match(maxLevel)){
					var val = JSON.parse(RegExp.$1.match(/\d+/g));
					entry.maxLevel = val;
				}
				else if (notelist[j].match(rank)){
					var val = RegExp.$1.match(/\w{1,2}/g)[0];
					entry.rank = val;
				}
			}

			//parse state
			if (entry.passiveStates.length > 0){
				var state = $dataStates[entry.passiveStates[0]];
				entry.effects = state.note.split(/[\r\n]+/);	
				entry.passiveStateId = state.id;
			}
		}
	};

	//====================================================================================
	//===================================Custom Functions=================================
	//====================================================================================

	var _BLKR_translateRank = function(rank){
		var r;
		switch(rank){
			case 'SS':
				r = 6;
				break;
			case 'S':
				r = 5;
				break;
			case 'A':
				r = 4;
				break;
			case 'B':
				r = 3;
				break;
			case 'C':
				r = 2;
				break;
			default:
				r = 1;
				break;
		}
		return r;
	};

	var _BLKR_ProficiencyEquation = function(rank, level){
		var r = -1;
		r = _BLKR_translateRank(rank);
		return Math.floor(BlkRaison.Param.LevelUpBaseRequirement * Math.pow(1 + (BlkRaison.Param.PercentageIncreasePerLevel * r)/100, level));
	}

	var _BLKR_ProficiencyCurve = function(rank,level,exp){
		var requiredAmount = _BLKR_ProficiencyEquation(rank,level);
		var randomProficiencyNum = Math.random() + 1;

		exp += randomProficiencyNum * (1.5);
		if (exp >= requiredAmount){
			exp = -1;
		}

		return exp;

	};


	//====================================================================================
	//==================================Game Actor========================================
	//====================================================================================
	//===========================Updating Skill Proficiency===============================
	//====================================================================================

	_BLKR_SP_Game_Actor_initSkills = Game_Actor.prototype.initSkills;
	Game_Actor.prototype.initSkills = function() {
		_BLKR_SP_Game_Actor_initSkills.call(this);
		this.refreshSkills();
	};

	Game_Actor.prototype.refreshSkills = function(){
		this._skillsProficiency = [];
		this._skillsLevel = [];
		this._skills.forEach(function(skill){
			this._skillsProficiency.push(0);
			this._skillsLevel.push(1);
		},this);
	};

	Game_Actor.prototype.updateSkillProficiency = function(skillId) {
		var exp;
		var i = this._skills.indexOf(skillId);
		if (i > -1){
			var skill = $dataSkills[skillId];
			exp = parseInt(this._skillsProficiency[i]);
			if (skill.maxLevel > this._skillsLevel[i]){
				var r = _BLKR_translateRank(skill.rank);
				exp = _BLKR_ProficiencyCurve(r, this._skillsLevel[i], exp);
				if (exp === -1){ //Level up
					this._skillsProficiency[i] = 0;
					this._skillsLevel[i] += 1;
				}
				else{
					this._skillsProficiency[i] = exp;
				}
			}
		}
	};

	Game_Actor.prototype.getProficiencyNormalized = function(skillId) {
		var exp;
		var i = this._skills.indexOf(skillId);
		var skill = $dataSkills[this._skills[i]];
		if (skill){
			if (skill.maxLevel === this._skillsLevel[i]){
				return 1;
			}
			exp = parseInt(this._skillsProficiency[i]);
			var amt = _BLKR_ProficiencyEquation(skill.rank,this._skillsLevel[i]);
			return (exp/amt);
		}
	};

	Game_Actor.prototype.getProficiencyLevel = function(skillId){
		var i = this._skills.indexOf(skillId);
		var skill = $dataSkills[this._skills[i]];
		if (skill){
			if (skill.maxLevel === this._skillsLevel[i]){
				return "MAX";
			}
		}
		return ("Lv " + this._skillsLevel[i]);
	};

	//====================================================================================
	//====================================BattleManager===================================
	//====================================================================================	
	_BLKR_SP_BattleManager_endAction = BattleManager.endAction;
	BattleManager.endAction = function() {
		_BLKR_SP_BattleManager_endAction.call(this);			
		var curActor = this._subject;
		var skill = this._action._item;

		if (skill._dataClass === "skill" && curActor != null){
			if (skill._itemId > BlkRaison.Param.UnapplicableSkills){ //NOT ATTACK OR GUARD
				if (curActor.isActor()){
					curActor.updateSkillProficiency(skill._itemId);	
				}
			}
		}
	};

	//====================================================================================
	//==========================Adding subtracting class system===========================
	//====================================================================================
	Game_Actor.prototype.learnSkill = function(skillId) {
		 if (!this.isLearnedSkill(skillId)) {
	        this._skills.push(skillId);
	        this._skills.sort(function(a, b) {
	            return a - b;
	        });
	        var index = this._skills.indexOf(skillId);
	        if (this._skillsLevel == null){
	        	this._skillsLevel = [];
	        }
	        if (this._skillsProficiency == null){
	        	this._skillsProficiency = [];
	        }
	        this._skillsProficiency.splice(index, 0, 0);
	        this._skillsLevel.splice(index, 0, 1);
	    }
	};

	_BLKR_SP_GAME_ACTOR_forgetSkill = Game_Actor.prototype.forgetSkill;
	Game_Actor.prototype.forgetSkill = function(skillId) {
	    var index = this._skills.indexOf(skillId);
	    if (index >= 0) {
	        this._skillsProficiency.splice(index, 1);
	        this._skillsLevel.splice(index, 1);
	    }
	    _BLKR_SP_GAME_ACTOR_forgetSkill.call(this,skillId);
	};	

    _BLKR_ADVS_Game_Actor_changeClass = Game_Actor.prototype.changeClass;
	Game_Actor.prototype.changeClass = function(classId, keepExp) {
	    _BLKR_ADVS_Game_Actor_changeClass.call(this,classId, keepExp);
		this.currentClass().learnings.forEach(function(learning) {
	        if (learning.level === this._level) {
	            this.learnSkill(learning.skillId);
	        }
	    }, this);

	};

	//increase proficiency when skill is used during menu
	_BLKR_SP_Scene_Skill_useItem = Scene_Skill.prototype.useItem;
    Scene_Skill.prototype.useItem = function() {
    		_BLKR_SP_Scene_Skill_useItem.call(this);
    		var actor = this._itemWindow._actor;
    		actor.updateSkillProficiency(actor.lastMenuSkill().id);
    };
   	//=====================================================================================
   	//=======================Damage Calculation with bonus damage skills===================
   	//=============================YANFLY AUTO PASSIVE STATES==============================
   	//=====================================================================================
    Game_Action.prototype.evalDamageFormula = function(target) {
	    try {
	        var item = this.item();
	        var sign = ([3, 4].contains(item.damage.type) ? -1 : 1);
	        var a = this.subject();
	        var b = target;
	        var level = [];
	        var bonus = 0;

	        if (a.isActor()){
	        	if (item.meta.card){
		        	var itemnotes = item.note.split(/[\r\n]+/);
		        	//looking for card type
		        	var cardtype = "";
		        	for (var i = 0; i < itemnotes.length; i++){
		        		if(itemnotes[i].match(/<(?:Card Type):[ ]*(\w+\s*)>/i)){
		        			cardtype = RegExp.$1.match(/\w+/g)[0];
		        		}
		        	}
		        	var regex = new RegExp("<"+cardtype+" Damage:[ ]*([+-]*[A-z0-9.*+-]+\s*)>","i");
		        	//var passiveStates = a._passiveStatesRaw; //list of indices
		        	var applicableEffects = [];
		        	var levelOfEffects = [];
		        	//Damage conditions
		        	
	        		for (var i = 0; i < a.skills().length; i++){ //iterates through player skills
		        		var notelist = a.skills()[i].effects;
		        		for (var j = 0; j < notelist.length; j++){
	        				if (sign > 0){
			        			//Check different DAMAGE boosters
			        			//Check For condition
			        			if (this.evalADVSConditions(notelist, target)){
			        				if (notelist[j].match(/<Damage:[ ]*([+-]*[A-z0-9.*+-]+\s*)>/i)){
				        				applicableEffects.push(RegExp.$1.match(/[A-z0-9.*+-]+/g)[0]);
				        				levelOfEffects.push(a._skillsLevel[i]);
				        				a.updateSkillProficiency(a.skills()[i].id);
				        			}
				        			else if (notelist[j].match(regex)){
				        				applicableEffects.push(RegExp.$1.match(/[A-z0-9.*+-]+/g)[0]);
				        				levelOfEffects.push(a._skillsLevel[i]);
				        				a.updateSkillProficiency(a.skills()[i].id);
				        			}
			        			}
			        			
			        		}
			        		else{
			        			//Check different HEAL boosters
			        			if (notelist[j].match(/<Outgoing Heal:[ ]*([+-]*[A-z0-9.*+-]+\s*)>/i)){
			        				applicableEffects.push(RegExp.$1.match(/[A-z0-9.*+-]+/g)[0]);
			        				levelOfEffects.push(a._skillsLevel[i]);
			        				a.updateSkillProficiency(a.skills()[i].id);
			        			}
			        		}
		        				        			
		        		}
		        	}
		        	applicableEffects.forEach(function(formula){
		        		level = levelOfEffects.shift();
		        		bonus += eval(formula);
		        	});
		        	console.log(bonus);
	        	}
	        }
	        bonus = 1 + bonus/100;
	        var v = $gameVariables._data;
	        return Math.max(eval(item.damage.formula) * bonus, 0) * sign;
	    } catch (e) {
	        return 0;
	    }
	};

	Game_Action.prototype.evalADVSConditions = function(notelist,b){
		for (var j = 0; j < notelist.length; j++){
			//var notetag = notelist[j].match(/<(?:Condition):[ ]*(if [ \(\)\{\}\.<>A-z0-9+;]*})>/i);
			var notetag = notelist[j].match(/<(?:Condition):[\n\r ]*(if [ \n\r\(\)\{\}\.<>A-z0-9+\/\*;]*})>/i);
			if (notetag){
				var a = this.subject();		
				//var condition = RegExp.$1.match(/if[ \(\)\{\}\.<>A-z0-9+;]*}/i);
				var condition = RegExp.$1.match(/if[ \n\r\(\)\{\}\.<>A-z0-9+;]*}/i);
				console.log(condition[0]);
				var bool = eval(condition[0]);
				return bool;
			}
		}
		return true;		
	};

	//=====================================UI========================================//
	//===The following modify the DEFAULT Skill screen to include appropriate bars===//
	//===============================================================================//

	Window_SkillList.prototype.maxCols = function() {
		return 1;
	};

    Window_SkillList.prototype.drawSkillProficiency = function(actor, skillId, x, y, width) {
        var color1 = "#eeee00";
        var color2 = "#ffff00";
        this.drawGauge(x+Graphics.width - width/3 - 30, y, width/3, actor.getProficiencyNormalized(skillId), color1, color2);
        this.changeTextColor(this.systemColor());
        this.drawText(actor.getProficiencyLevel(skillId), x+Graphics.width - width/3 - this.costWidth() , y, 44);
    };

    Window_SkillList.prototype.drawItem = function(index) {
	    var skill = this._data[index];
	    if (skill) {
	        var costWidth = this.costWidth();
	        var rect = this.itemRect(index);
	        rect.width -= this.textPadding();
	        this.changePaintOpacity(this.isEnabled(skill));
	        this.drawItemName(skill, rect.x, rect.y, rect.width - costWidth);
	        this.drawSkillCost(skill, rect.x, rect.y, rect.width/2 - costWidth);
	       	if (!$gameParty.inBattle()){
	       		this.drawSkillProficiency(this._actor, skill.id, rect.x, rect.y, rect.width);	
	       	}
	        this.changePaintOpacity(1);
    	};
	};


})();